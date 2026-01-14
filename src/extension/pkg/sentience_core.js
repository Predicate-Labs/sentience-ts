let wasm;

function addHeapObject(obj) {
    heap_next === heap.length && heap.push(heap.length + 1);
    const idx = heap_next;
    return heap_next = heap[idx], heap[idx] = obj, idx;
}

function debugString(val) {
    const type = typeof val;
    if ("number" == type || "boolean" == type || null == val) return `${val}`;
    if ("string" == type) return `"${val}"`;
    if ("symbol" == type) {
        const description = val.description;
        return null == description ? "Symbol" : `Symbol(${description})`;
    }
    if ("function" == type) {
        const name = val.name;
        return "string" == typeof name && name.length > 0 ? `Function(${name})` : "Function";
    }
    if (Array.isArray(val)) {
        const length = val.length;
        let debug = "[";
        length > 0 && (debug += debugString(val[0]));
        for (let i = 1; i < length; i++) debug += ", " + debugString(val[i]);
        return debug += "]", debug;
    }
    const builtInMatches = /\[object ([^\]]+)\]/.exec(toString.call(val));
    let className;
    if (!(builtInMatches && builtInMatches.length > 1)) return toString.call(val);
    if (className = builtInMatches[1], "Object" == className) try {
        return "Object(" + JSON.stringify(val) + ")";
    } catch (_) {
        return "Object";
    }
    return val instanceof Error ? `${val.name}: ${val.message}\n${val.stack}` : className;
}

function dropObject(idx) {
    idx < 132 || (heap[idx] = heap_next, heap_next = idx);
}

function getArrayU8FromWasm0(ptr, len) {
    return ptr >>>= 0, getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;

function getDataViewMemory0() {
    return (null === cachedDataViewMemory0 || !0 === cachedDataViewMemory0.buffer.detached || void 0 === cachedDataViewMemory0.buffer.detached && cachedDataViewMemory0.buffer !== wasm.memory.buffer) && (cachedDataViewMemory0 = new DataView(wasm.memory.buffer)), 
    cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>>= 0, len);
}

let cachedUint8ArrayMemory0 = null;

function getUint8ArrayMemory0() {
    return null !== cachedUint8ArrayMemory0 && 0 !== cachedUint8ArrayMemory0.byteLength || (cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer)), 
    cachedUint8ArrayMemory0;
}

function getObject(idx) {
    return heap[idx];
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        wasm.__wbindgen_export3(addHeapObject(e));
    }
}

let heap = new Array(128).fill(void 0);

heap.push(void 0, null, !0, !1);

let heap_next = heap.length;

function isLikeNone(x) {
    return null == x;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (void 0 === realloc) {
        const buf = cachedTextEncoder.encode(arg), ptr = malloc(buf.length, 1) >>> 0;
        return getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf), WASM_VECTOR_LEN = buf.length, 
        ptr;
    }
    let len = arg.length, ptr = malloc(len, 1) >>> 0;
    const mem = getUint8ArrayMemory0();
    let offset = 0;
    for (;offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 127) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        0 !== offset && (arg = arg.slice(offset)), ptr = realloc(ptr, len, len = offset + 3 * arg.length, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        offset += cachedTextEncoder.encodeInto(arg, view).written, ptr = realloc(ptr, len, offset, 1) >>> 0;
    }
    return WASM_VECTOR_LEN = offset, ptr;
}

function takeObject(idx) {
    const ret = getObject(idx);
    return dropObject(idx), ret;
}

let cachedTextDecoder = new TextDecoder("utf-8", {
    ignoreBOM: !0,
    fatal: !0
});

cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;

let numBytesDecoded = 0;

function decodeText(ptr, len) {
    return numBytesDecoded += len, numBytesDecoded >= MAX_SAFARI_DECODE_BYTES && (cachedTextDecoder = new TextDecoder("utf-8", {
        ignoreBOM: !0,
        fatal: !0
    }), cachedTextDecoder.decode(), numBytesDecoded = len), cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder;

"encodeInto" in cachedTextEncoder || (cachedTextEncoder.encodeInto = function(arg, view) {
    const buf = cachedTextEncoder.encode(arg);
    return view.set(buf), {
        read: arg.length,
        written: buf.length
    };
});

let WASM_VECTOR_LEN = 0;

export function analyze_page(val) {
    return takeObject(wasm.analyze_page(addHeapObject(val)));
}

export function analyze_page_with_options(val, options) {
    return takeObject(wasm.analyze_page_with_options(addHeapObject(val), addHeapObject(options)));
}

export function decide_and_act(_raw_elements) {
    wasm.decide_and_act(addHeapObject(_raw_elements));
}

export function prune_for_api(val) {
    return takeObject(wasm.prune_for_api(addHeapObject(val)));
}

const EXPECTED_RESPONSE_TYPES = new Set([ "basic", "cors", "default" ]);

async function __wbg_load(module, imports) {
    if ("function" == typeof Response && module instanceof Response) {
        if ("function" == typeof WebAssembly.instantiateStreaming) try {
            return await WebAssembly.instantiateStreaming(module, imports);
        } catch (e) {
            if (!(module.ok && EXPECTED_RESPONSE_TYPES.has(module.type)) || "application/wasm" === module.headers.get("Content-Type")) throw e;
        }
        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    }
    {
        const instance = await WebAssembly.instantiate(module, imports);
        return instance instanceof WebAssembly.Instance ? {
            instance: instance,
            module: module
        } : instance;
    }
}

function __wbg_get_imports() {
    const imports = {
        wbg: {}
    };
    return imports.wbg.__wbg_Error_52673b7de5a0ca89 = function(arg0, arg1) {
        return addHeapObject(Error(getStringFromWasm0(arg0, arg1)));
    }, imports.wbg.__wbg_Number_2d1dcfcf4ec51736 = function(arg0) {
        return Number(getObject(arg0));
    }, imports.wbg.__wbg___wbindgen_bigint_get_as_i64_6e32f5e6aff02e1d = function(arg0, arg1) {
        const v = getObject(arg1), ret = "bigint" == typeof v ? v : void 0;
        getDataViewMemory0().setBigInt64(arg0 + 8, isLikeNone(ret) ? BigInt(0) : ret, !0), 
        getDataViewMemory0().setInt32(arg0 + 0, !isLikeNone(ret), !0);
    }, imports.wbg.__wbg___wbindgen_boolean_get_dea25b33882b895b = function(arg0) {
        const v = getObject(arg0), ret = "boolean" == typeof v ? v : void 0;
        return isLikeNone(ret) ? 16777215 : ret ? 1 : 0;
    }, imports.wbg.__wbg___wbindgen_debug_string_adfb662ae34724b6 = function(arg0, arg1) {
        const ptr1 = passStringToWasm0(debugString(getObject(arg1)), wasm.__wbindgen_export, wasm.__wbindgen_export2), len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4, len1, !0), getDataViewMemory0().setInt32(arg0 + 0, ptr1, !0);
    }, imports.wbg.__wbg___wbindgen_in_0d3e1e8f0c669317 = function(arg0, arg1) {
        return getObject(arg0) in getObject(arg1);
    }, imports.wbg.__wbg___wbindgen_is_bigint_0e1a2e3f55cfae27 = function(arg0) {
        return "bigint" == typeof getObject(arg0);
    }, imports.wbg.__wbg___wbindgen_is_function_8d400b8b1af978cd = function(arg0) {
        return "function" == typeof getObject(arg0);
    }, imports.wbg.__wbg___wbindgen_is_object_ce774f3490692386 = function(arg0) {
        const val = getObject(arg0);
        return "object" == typeof val && null !== val;
    }, imports.wbg.__wbg___wbindgen_is_undefined_f6b95eab589e0269 = function(arg0) {
        return void 0 === getObject(arg0);
    }, imports.wbg.__wbg___wbindgen_jsval_eq_b6101cc9cef1fe36 = function(arg0, arg1) {
        return getObject(arg0) === getObject(arg1);
    }, imports.wbg.__wbg___wbindgen_jsval_loose_eq_766057600fdd1b0d = function(arg0, arg1) {
        return getObject(arg0) == getObject(arg1);
    }, imports.wbg.__wbg___wbindgen_number_get_9619185a74197f95 = function(arg0, arg1) {
        const obj = getObject(arg1), ret = "number" == typeof obj ? obj : void 0;
        getDataViewMemory0().setFloat64(arg0 + 8, isLikeNone(ret) ? 0 : ret, !0), getDataViewMemory0().setInt32(arg0 + 0, !isLikeNone(ret), !0);
    }, imports.wbg.__wbg___wbindgen_string_get_a2a31e16edf96e42 = function(arg0, arg1) {
        const obj = getObject(arg1), ret = "string" == typeof obj ? obj : void 0;
        var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2), len1 = WASM_VECTOR_LEN;
        getDataViewMemory0().setInt32(arg0 + 4, len1, !0), getDataViewMemory0().setInt32(arg0 + 0, ptr1, !0);
    }, imports.wbg.__wbg___wbindgen_throw_dd24417ed36fc46e = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    }, imports.wbg.__wbg_call_abb4ff46ce38be40 = function() {
        return handleError(function(arg0, arg1) {
            return addHeapObject(getObject(arg0).call(getObject(arg1)));
        }, arguments);
    }, imports.wbg.__wbg_done_62ea16af4ce34b24 = function(arg0) {
        return getObject(arg0).done;
    }, imports.wbg.__wbg_error_7bc7d576a6aaf855 = function(arg0) {}, imports.wbg.__wbg_get_6b7bd52aca3f9671 = function(arg0, arg1) {
        return addHeapObject(getObject(arg0)[arg1 >>> 0]);
    }, imports.wbg.__wbg_get_af9dab7e9603ea93 = function() {
        return handleError(function(arg0, arg1) {
            return addHeapObject(Reflect.get(getObject(arg0), getObject(arg1)));
        }, arguments);
    }, imports.wbg.__wbg_get_with_ref_key_1dc361bd10053bfe = function(arg0, arg1) {
        return addHeapObject(getObject(arg0)[getObject(arg1)]);
    }, imports.wbg.__wbg_instanceof_ArrayBuffer_f3320d2419cd0355 = function(arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof ArrayBuffer;
        } catch (_) {
            result = !1;
        }
        return result;
    }, imports.wbg.__wbg_instanceof_Uint8Array_da54ccc9d3e09434 = function(arg0) {
        let result;
        try {
            result = getObject(arg0) instanceof Uint8Array;
        } catch (_) {
            result = !1;
        }
        return result;
    }, imports.wbg.__wbg_isArray_51fd9e6422c0a395 = function(arg0) {
        return Array.isArray(getObject(arg0));
    }, imports.wbg.__wbg_isSafeInteger_ae7d3f054d55fa16 = function(arg0) {
        return Number.isSafeInteger(getObject(arg0));
    }, imports.wbg.__wbg_iterator_27b7c8b35ab3e86b = function() {
        return addHeapObject(Symbol.iterator);
    }, imports.wbg.__wbg_js_click_element_2fe1e774f3d232c7 = function(arg0) {
        js_click_element(arg0);
    }, imports.wbg.__wbg_length_22ac23eaec9d8053 = function(arg0) {
        return getObject(arg0).length;
    }, imports.wbg.__wbg_length_d45040a40c570362 = function(arg0) {
        return getObject(arg0).length;
    }, imports.wbg.__wbg_new_1ba21ce319a06297 = function() {
        return addHeapObject(new Object);
    }, imports.wbg.__wbg_new_25f239778d6112b9 = function() {
        return addHeapObject(new Array);
    }, imports.wbg.__wbg_new_6421f6084cc5bc5a = function(arg0) {
        return addHeapObject(new Uint8Array(getObject(arg0)));
    }, imports.wbg.__wbg_next_138a17bbf04e926c = function(arg0) {
        return addHeapObject(getObject(arg0).next);
    }, imports.wbg.__wbg_next_3cfe5c0fe2a4cc53 = function() {
        return handleError(function(arg0) {
            return addHeapObject(getObject(arg0).next());
        }, arguments);
    }, imports.wbg.__wbg_prototypesetcall_dfe9b766cdc1f1fd = function(arg0, arg1, arg2) {
        Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), getObject(arg2));
    }, imports.wbg.__wbg_set_3f1d0b984ed272ed = function(arg0, arg1, arg2) {
        getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
    }, imports.wbg.__wbg_set_7df433eea03a5c14 = function(arg0, arg1, arg2) {
        getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
    }, imports.wbg.__wbg_value_57b7b035e117f7ee = function(arg0) {
        return addHeapObject(getObject(arg0).value);
    }, imports.wbg.__wbindgen_cast_2241b6af4c4b2941 = function(arg0, arg1) {
        return addHeapObject(getStringFromWasm0(arg0, arg1));
    }, imports.wbg.__wbindgen_cast_4625c577ab2ec9ee = function(arg0) {
        return addHeapObject(BigInt.asUintN(64, arg0));
    }, imports.wbg.__wbindgen_cast_d6cd19b81560fd6e = function(arg0) {
        return addHeapObject(arg0);
    }, imports.wbg.__wbindgen_object_clone_ref = function(arg0) {
        return addHeapObject(getObject(arg0));
    }, imports.wbg.__wbindgen_object_drop_ref = function(arg0) {
        takeObject(arg0);
    }, imports;
}

function __wbg_finalize_init(instance, module) {
    return wasm = instance.exports, __wbg_init.__wbindgen_wasm_module = module, cachedDataViewMemory0 = null, 
    cachedUint8ArrayMemory0 = null, wasm;
}

function initSync(module) {
    if (void 0 !== wasm) return wasm;
    void 0 !== module && Object.getPrototypeOf(module) === Object.prototype && ({module: module} = module);
    const imports = __wbg_get_imports();
    module instanceof WebAssembly.Module || (module = new WebAssembly.Module(module));
    return __wbg_finalize_init(new WebAssembly.Instance(module, imports), module);
}

async function __wbg_init(module_or_path) {
    if (void 0 !== wasm) return wasm;
    void 0 !== module_or_path && Object.getPrototypeOf(module_or_path) === Object.prototype && ({module_or_path: module_or_path} = module_or_path), 
    void 0 === module_or_path && (module_or_path = new URL("sentience_core_bg.wasm", import.meta.url));
    const imports = __wbg_get_imports();
    ("string" == typeof module_or_path || "function" == typeof Request && module_or_path instanceof Request || "function" == typeof URL && module_or_path instanceof URL) && (module_or_path = fetch(module_or_path));
    const {instance: instance, module: module} = await __wbg_load(await module_or_path, imports);
    return __wbg_finalize_init(instance, module);
}

export { initSync };

export default __wbg_init;