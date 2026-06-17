var config = self.config;
var concealjs = self.concealjs;
var JSBigInt = self.JSBigInt;
var logDebugMsg = self.logDebugMsg || function () {};
var reportError = self.reportError || function (e) { console.error(e); };
"use strict";
(() => {
  // lib/wallet-core/MathUtil.ts
  var MathUtil = class _MathUtil {
    static randomFloat() {
      const randomBuffer = new Uint32Array(1);
      window.crypto.getRandomValues(randomBuffer);
      return randomBuffer[0] / (4294967295 + 1);
    }
    static randomUint32() {
      const randomBuffer = new Uint32Array(1);
      window.crypto.getRandomValues(randomBuffer);
      return randomBuffer[0];
    }
    static getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    static randomTriangularSimplified(max) {
      const r = _MathUtil.randomUint32() % (1 << 53);
      const frac = Math.sqrt(r / (1 << 53));
      let i = frac * max | 0;
      if (i === max) --i;
      return i;
    }
  };

  // lib/wallet-core/ChaCha8.ts
  var JSChaCha8 = class {
    constructor(bufKey, bufNonce, counter) {
      this.getBuffer = (size) => {
        return Buffer.alloc(size);
      };
      /*
       * Little-endian to uint 32 bytes
       *
       * @param {Uint8Array|[number]} data
       * @param {number} index
       * @return {number}
       * @private
       */
      this.get32 = (data, index) => {
        return data[index++] ^ data[index++] << 8 ^ data[index++] << 16 ^ data[index] << 24;
      };
      /*
       * The basic operation of the ChaCha algorithm is the quarter round.
       * It operates on four 32-bit unsigned integers, denoted a, b, c, and d.
       *
       * @param {Array} output
       * @param {number} a
       * @param {number} b
       * @param {number} c
       * @param {number} d
       * @private
       */
      this.quarterround = (output, a, b, c, d) => {
        output[d] = this.rotl(output[d] ^ (output[a] += output[b]), 16);
        output[b] = this.rotl(output[b] ^ (output[c] += output[d]), 12);
        output[d] = this.rotl(output[d] ^ (output[a] += output[b]), 8);
        output[b] = this.rotl(output[b] ^ (output[c] += output[d]), 7);
        output[a] >>>= 0;
        output[b] >>>= 0;
        output[c] >>>= 0;
        output[d] >>>= 0;
      };
      this.chacha = () => {
        const mix = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
        let b = 0;
        for (let i = 0; i < 16; i++) {
          mix[i] = this.param[i];
        }
        for (let i = 0; i < this.rounds; i += 2) {
          this.quarterround(mix, 0, 4, 8, 12);
          this.quarterround(mix, 1, 5, 9, 13);
          this.quarterround(mix, 2, 6, 10, 14);
          this.quarterround(mix, 3, 7, 11, 15);
          this.quarterround(mix, 0, 5, 10, 15);
          this.quarterround(mix, 1, 6, 11, 12);
          this.quarterround(mix, 2, 7, 8, 13);
          this.quarterround(mix, 3, 4, 9, 14);
        }
        for (let i = 0; i < 16; i++) {
          mix[i] += this.param[i];
          this.keystream[b++] = mix[i] & 255;
          this.keystream[b++] = mix[i] >>> 8 & 255;
          this.keystream[b++] = mix[i] >>> 16 & 255;
          this.keystream[b++] = mix[i] >>> 24 & 255;
        }
      };
      /**
       * Cyclic left rotation
       *
       * @param {number} data
       * @param {number} shift
       * @return {number}
       * @private
       */
      this.rotl = (data, shift) => {
        return data << shift | data >>> 32 - shift;
      };
      /**
       *  Encrypt data with key and nonce
       *
       * @param {Buffer} data
       * @return {Buffer}
       */
      this.encrypt = (data) => {
        return this.update(data);
      };
      /**
       *  Decrypt data with key and nonce
       *
       * @param {Buffer} data
       * @return {Buffer}
       */
      this.decrypt = (data) => {
        return this.update(data);
      };
      /**
       *  Encrypt or Decrypt data with key and nonce
       *
       * @param {Uint8Array} data
       * @return {Uint8Array}
       * @private
       */
      this.update = (data) => {
        if (!(data instanceof Uint8Array) || data.length === 0) {
          throw new Error("Data should be type of bytes (Uint8Array) and not empty!");
        }
        var output = new Uint8Array(data.length);
        for (var i = 0; i < data.length; i++) {
          if (this.byteCounter === 0 || this.byteCounter === 64) {
            this.chacha();
            this.param[12]++;
            this.byteCounter = 0;
          }
          output[i] = data[i] ^ this.keystream[this.byteCounter++];
        }
        return output;
      };
      if (typeof counter === "undefined") {
        counter = 0;
      }
      if (!(bufKey instanceof Uint8Array) || bufKey.length !== 32) {
        throw new Error("Key should be 32 byte buffer!");
      }
      if (!(bufNonce instanceof Uint8Array) || bufNonce.length !== 12) {
        throw new Error("Nonce should be 12 byte buffer!");
      }
      const key = new Uint8Array(bufKey);
      const nonce = new Uint8Array(bufNonce);
      const dummyArray = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
      this.rounds = 8;
      this.sigma = [1634760805, 857760878, 2036477234, 1797285236];
      this.param = [
        this.sigma[0],
        this.sigma[1],
        this.sigma[2],
        this.sigma[3],
        // key
        this.get32(key, 0),
        this.get32(key, 4),
        this.get32(key, 8),
        this.get32(key, 12),
        this.get32(key, 16),
        this.get32(key, 20),
        this.get32(key, 24),
        this.get32(key, 28),
        this.get32(dummyArray, 0),
        this.get32(dummyArray, 4),
        // nonce
        this.get32(nonce, 0),
        this.get32(nonce, 4)
      ];
      this.keystream = [
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
      ];
      this.byteCounter = 0;
    }
  };

  // lib/wallet-core/Cn.ts
  var HASH_SIZE = 32;
  var ADDRESS_CHECKSUM_SIZE = 4;
  var INTEGRATED_ID_SIZE = 8;
  var ENCRYPTED_PAYMENT_ID_TAIL = 141;
  var cfg = globalThis.config;
  var useTestnet = cfg?.testnet === true;
  var CRYPTONOTE_PUBLIC_ADDRESS_BASE58_PREFIX = useTestnet ? cfg?.addressPrefixTestnet ?? 31444 : cfg?.addressPrefix ?? 31444;
  var CRYPTONOTE_PUBLIC_INTEGRATED_ADDRESS_BASE58_PREFIX = useTestnet ? cfg?.integratedAddressPrefixTestnet ?? 31445 : cfg?.integratedAddressPrefix ?? 31445;
  var CRYPTONOTE_PUBLIC_SUBADDRESS_BASE58_PREFIX = useTestnet ? cfg?.subAddressPrefixTestnet ?? 31446 : cfg?.subAddressPrefix ?? 31446;
  if (cfg && cfg.testnet === true) {
    CRYPTONOTE_PUBLIC_ADDRESS_BASE58_PREFIX = cfg.addressPrefixTestnet;
    CRYPTONOTE_PUBLIC_INTEGRATED_ADDRESS_BASE58_PREFIX = cfg.integratedAddressPrefixTestnet;
    CRYPTONOTE_PUBLIC_SUBADDRESS_BASE58_PREFIX = cfg.subAddressPrefixTestnet;
  }
  var UINT64_MAX = new JSBigInt(2).pow(64);
  var CURRENT_TX_VERSION = 1;
  var OLD_TX_VERSION = 1;
  var DEPOSIT_TX_VERSION = 2;
  var TX_EXTRA_NONCE_MAX_COUNT = 255;
  var TX_EXTRA_TAGS = {
    PADDING: "00",
    PUBKEY: "01",
    NONCE: "02",
    MERGE_MINING: "03",
    ADDITIONAL_PUBKEY: "04",
    MESSAGE_TAG: "04",
    TTL_TAG: "05"
  };
  var TX_EXTRA_NONCE_TAGS = {
    PAYMENT_ID: "00",
    ENCRYPTED_PAYMENT_ID: "01"
  };
  var KEY_SIZE = 32;
  var STRUCT_SIZES = {
    GE_P3: 160,
    GE_P2: 120,
    GE_P1P1: 160,
    GE_CACHED: 160,
    EC_SCALAR: 32,
    EC_POINT: 32,
    KEY_IMAGE: 32,
    GE_DSMP: 160 * 8,
    // ge_cached * 8
    SIGNATURE: 64
    // ec_scalar * 2
  };
  var CnVars;
  ((CnVars2) => {
    let RCT_TYPE;
    ((RCT_TYPE2) => {
      RCT_TYPE2[RCT_TYPE2["Null"] = 0] = "Null";
      RCT_TYPE2[RCT_TYPE2["Full"] = 1] = "Full";
      RCT_TYPE2[RCT_TYPE2["Simple"] = 2] = "Simple";
      RCT_TYPE2[RCT_TYPE2["FullBulletproof"] = 3] = "FullBulletproof";
      RCT_TYPE2[RCT_TYPE2["SimpleBulletproof"] = 4] = "SimpleBulletproof";
    })(RCT_TYPE = CnVars2.RCT_TYPE || (CnVars2.RCT_TYPE = {}));
    CnVars2.H = "8b655970153799af2aeadc9ff1add0ea6c7251d54154cfa92c173a0dd39c1f94";
    CnVars2.l = JSBigInt(
      "7237005577332262213973186563042994240857116359379907606001950938285454250989"
    );
    CnVars2.I = "0100000000000000000000000000000000000000000000000000000000000000";
    CnVars2.Z = "0000000000000000000000000000000000000000000000000000000000000000";
    CnVars2.H2 = [
      "8b655970153799af2aeadc9ff1add0ea6c7251d54154cfa92c173a0dd39c1f94",
      "8faa448ae4b3e2bb3d4d130909f55fcd79711c1c83cdbccadd42cbe1515e8712",
      "12a7d62c7791654a57f3e67694ed50b49a7d9e3fc1e4c7a0bde29d187e9cc71d",
      "789ab9934b49c4f9e6785c6d57a498b3ead443f04f13df110c5427b4f214c739",
      "771e9299d94f02ac72e38e44de568ac1dcb2edc6edb61f83ca418e1077ce3de8",
      "73b96db43039819bdaf5680e5c32d741488884d18d93866d4074a849182a8a64",
      "8d458e1c2f68ebebccd2fd5d379f5e58f8134df3e0e88cad3d46701063a8d412",
      "09551edbe494418e81284455d64b35ee8ac093068a5f161fa6637559177ef404",
      "d05a8866f4df8cee1e268b1d23a4c58c92e760309786cdac0feda1d247a9c9a7",
      "55cdaad518bd871dd1eb7bc7023e1dc0fdf3339864f88fdd2de269fe9ee1832d",
      "e7697e951a98cfd5712b84bbe5f34ed733e9473fcb68eda66e3788df1958c306",
      "f92a970bae72782989bfc83adfaa92a4f49c7e95918b3bba3cdc7fe88acc8d47",
      "1f66c2d491d75af915c8db6a6d1cb0cd4f7ddcd5e63d3ba9b83c866c39ef3a2b",
      "3eec9884b43f58e93ef8deea260004efea2a46344fc5965b1a7dd5d18997efa7",
      "b29f8f0ccb96977fe777d489d6be9e7ebc19c409b5103568f277611d7ea84894",
      "56b1f51265b9559876d58d249d0c146d69a103636699874d3f90473550fe3f2c",
      "1d7a36575e22f5d139ff9cc510fa138505576b63815a94e4b012bfd457caaada",
      "d0ac507a864ecd0593fa67be7d23134392d00e4007e2534878d9b242e10d7620",
      "f6c6840b9cf145bb2dccf86e940be0fc098e32e31099d56f7fe087bd5deb5094",
      "28831a3340070eb1db87c12e05980d5f33e9ef90f83a4817c9f4a0a33227e197",
      "87632273d629ccb7e1ed1a768fa2ebd51760f32e1c0b867a5d368d5271055c6e",
      "5c7b29424347964d04275517c5ae14b6b5ea2798b573fc94e6e44a5321600cfb",
      "e6945042d78bc2c3bd6ec58c511a9fe859c0ad63fde494f5039e0e8232612bd5",
      "36d56907e2ec745db6e54f0b2e1b2300abcb422e712da588a40d3f1ebbbe02f6",
      "34db6ee4d0608e5f783650495a3b2f5273c5134e5284e4fdf96627bb16e31e6b",
      "8e7659fb45a3787d674ae86731faa2538ec0fdf442ab26e9c791fada089467e9",
      "3006cf198b24f31bb4c7e6346000abc701e827cfbb5df52dcfa42e9ca9ff0802",
      "f5fd403cb6e8be21472e377ffd805a8c6083ea4803b8485389cc3ebc215f002a",
      "3731b260eb3f9482e45f1c3f3b9dcf834b75e6eef8c40f461ea27e8b6ed9473d",
      "9f9dab09c3f5e42855c2de971b659328a2dbc454845f396ffc053f0bb192f8c3",
      "5e055d25f85fdb98f273e4afe08464c003b70f1ef0677bb5e25706400be620a5",
      "868bcf3679cb6b500b94418c0b8925f9865530303ae4e4b262591865666a4590",
      "b3db6bd3897afbd1df3f9644ab21c8050e1f0038a52f7ca95ac0c3de7558cb7a",
      "8119b3a059ff2cac483e69bcd41d6d27149447914288bbeaee3413e6dcc6d1eb",
      "10fc58f35fc7fe7ae875524bb5850003005b7f978c0c65e2a965464b6d00819c",
      "5acd94eb3c578379c1ea58a343ec4fcff962776fe35521e475a0e06d887b2db9",
      "33daf3a214d6e0d42d2300a7b44b39290db8989b427974cd865db011055a2901",
      "cfc6572f29afd164a494e64e6f1aeb820c3e7da355144e5124a391d06e9f95ea",
      "d5312a4b0ef615a331f6352c2ed21dac9e7c36398b939aec901c257f6cbc9e8e",
      "551d67fefc7b5b9f9fdbf6af57c96c8a74d7e45a002078a7b5ba45c6fde93e33",
      "d50ac7bd5ca593c656928f38428017fc7ba502854c43d8414950e96ecb405dc3",
      "0773e18ea1be44fe1a97e239573cfae3e4e95ef9aa9faabeac1274d3ad261604",
      "e9af0e7ca89330d2b8615d1b4137ca617e21297f2f0ded8e31b7d2ead8714660",
      "7b124583097f1029a0c74191fe7378c9105acc706695ed1493bb76034226a57b",
      "ec40057b995476650b3db98e9db75738a8cd2f94d863b906150c56aac19caa6b",
      "01d9ff729efd39d83784c0fe59c4ae81a67034cb53c943fb818b9d8ae7fc33e5",
      "00dfb3c696328c76424519a7befe8e0f6c76f947b52767916d24823f735baf2e",
      "461b799b4d9ceea8d580dcb76d11150d535e1639d16003c3fb7e9d1fd13083a8",
      "ee03039479e5228fdc551cbde7079d3412ea186a517ccc63e46e9fcce4fe3a6c",
      "a8cfb543524e7f02b9f045acd543c21c373b4c9b98ac20cec417a6ddb5744e94",
      "932b794bf89c6edaf5d0650c7c4bad9242b25626e37ead5aa75ec8c64e09dd4f",
      "16b10c779ce5cfef59c7710d2e68441ea6facb68e9b5f7d533ae0bb78e28bf57",
      "0f77c76743e7396f9910139f4937d837ae54e21038ac5c0b3fd6ef171a28a7e4",
      "d7e574b7b952f293e80dde905eb509373f3f6cd109a02208b3c1e924080a20ca",
      "45666f8c381e3da675563ff8ba23f83bfac30c34abdde6e5c0975ef9fd700cb9",
      "b24612e454607eb1aba447f816d1a4551ef95fa7247fb7c1f503020a7177f0dd",
      "7e208861856da42c8bb46a7567f8121362d9fb2496f131a4aa9017cf366cdfce",
      "5b646bff6ad1100165037a055601ea02358c0f41050f9dfe3c95dccbd3087be0",
      "746d1dccfed2f0ff1e13c51e2d50d5324375fbd5bf7ca82a8931828d801d43ab",
      "cb98110d4a6bb97d22feadbc6c0d8930c5f8fc508b2fc5b35328d26b88db19ae",
      "60b626a033b55f27d7676c4095eababc7a2c7ede2624b472e97f64f96b8cfc0e",
      "e5b52bc927468df71893eb8197ef820cf76cb0aaf6e8e4fe93ad62d803983104",
      "056541ae5da9961be2b0a5e895e5c5ba153cbb62dd561a427bad0ffd41923199",
      "f8fef05a3fa5c9f3eba41638b247b711a99f960fe73aa2f90136aeb20329b888"
    ];
  })(CnVars || (CnVars = {}));
  var CnRandom;
  ((CnRandom2) => {
    function rand_32() {
      return concealjs.mnemonic.mn_random(256);
    }
    CnRandom2.rand_32 = rand_32;
    function rand_16() {
      return concealjs.mnemonic.mn_random(128);
    }
    CnRandom2.rand_16 = rand_16;
    function rand_8() {
      return concealjs.mnemonic.mn_random(64);
    }
    CnRandom2.rand_8 = rand_8;
    function random_scalar() {
      return concealjs.crypto.sc_reduce32(CnRandom2.rand_32());
    }
    CnRandom2.random_scalar = random_scalar;
  })(CnRandom || (CnRandom = {}));
  var CnUtils;
  ((CnUtils2) => {
    function hextobin(hex) {
      return concealjs.cnutils.hextobin(hex);
    }
    CnUtils2.hextobin = hextobin;
    function bintohex(bin) {
      return concealjs.cnutils.bintohex(bin);
    }
    CnUtils2.bintohex = bintohex;
    function swapEndian(hex) {
      return concealjs.cnutils.swapEndian(hex);
    }
    CnUtils2.swapEndian = swapEndian;
    function swapEndianC(string) {
      return concealjs.cnutils.swapEndianC(string);
    }
    CnUtils2.swapEndianC = swapEndianC;
    function d2h(integer) {
      if (typeof integer !== "string" && integer.toString().length > 15) {
        throw "integer should be entered as a string for precision";
      }
      let padding = "";
      for (let i = 0; i < 63; i++) {
        padding += "0";
      }
      return (padding + JSBigInt(integer).toString(16).toLowerCase()).slice(-64);
    }
    CnUtils2.d2h = d2h;
    function d2s(integer) {
      if (typeof integer === "string") {
        return CnUtils2.swapEndian(CnUtils2.d2h(integer));
      } else {
        return CnUtils2.swapEndian(CnUtils2.d2h(integer.toString()));
      }
    }
    CnUtils2.d2s = d2s;
    function h2d(hex) {
      let vali = 0;
      for (let j = 7; j >= 0; j--) {
        vali = vali * 256 + parseInt(hex.slice(j * 2, j * 2 + 2), 16);
      }
      return vali;
    }
    CnUtils2.h2d = h2d;
    function d2b(integer) {
      const integerStr = integer.toString();
      if (typeof integer !== "string" && integerStr.length > 15) {
        throw "integer should be entered as a string for precision";
      }
      let padding = "";
      for (let i = 0; i < 63; i++) {
        padding += "0";
      }
      const a = new JSBigInt(integerStr);
      if (a.toString(2).length > 64) {
        throw "amount overflows uint64!";
      }
      return CnUtils2.swapEndianC((padding + a.toString(2)).slice(-64));
    }
    CnUtils2.d2b = d2b;
    function ge_scalarmult(pub, sec) {
      if (pub.length !== 64 || sec.length !== 64) {
        throw "Invalid input length";
      }
      return concealjs.cnutils.ge_scalarmult(pub, sec);
    }
    CnUtils2.ge_scalarmult = ge_scalarmult;
    function ge_add(p1, p2) {
      if (p1.length !== 64 || p2.length !== 64) {
        throw "Invalid input length!";
      }
      return concealjs.cnutils.ge_add(p1, p2);
    }
    CnUtils2.ge_add = ge_add;
    function ge_neg(point) {
      if (point.length !== 64) {
        throw "expected 64 char hex string";
      }
      return point.slice(0, 62) + ((parseInt(point.slice(62, 63), 16) + 8) % 16).toString(16) + point.slice(63, 64);
    }
    CnUtils2.ge_neg = ge_neg;
    function ge_sub(point1, point2) {
      const point2n = CnUtils2.ge_neg(point2);
      return CnUtils2.ge_add(point1, point2n);
    }
    CnUtils2.ge_sub = ge_sub;
    function sec_key_to_pub(sec) {
      if (sec.length !== 64) {
        throw "Invalid sec length";
      }
      return concealjs.cnutils.sec_key_to_pub(sec);
    }
    CnUtils2.sec_key_to_pub = sec_key_to_pub;
    function valid_hex(hex) {
      const exp = new RegExp("[0-9a-fA-F]{" + hex.length + "}");
      return exp.test(hex);
    }
    CnUtils2.valid_hex = valid_hex;
    function ge_scalarmult_base(sec) {
      return CnUtils2.sec_key_to_pub(sec);
    }
    CnUtils2.ge_scalarmult_base = ge_scalarmult_base;
    function derivation_to_scalar(derivation, output_index) {
      let buf = "";
      if (derivation.length !== STRUCT_SIZES.EC_POINT * 2) {
        throw "Invalid derivation length!";
      }
      buf += derivation;
      const enc = CnUtils2.encode_varint(output_index);
      if (enc.length > 10 * 2) {
        throw "output_index didn't fit in 64-bit varint";
      }
      buf += enc;
      return Cn.hash_to_scalar(buf);
    }
    CnUtils2.derivation_to_scalar = derivation_to_scalar;
    function encode_varint(i) {
      let j = new JSBigInt(i);
      let out = "";
      while (j.compare(128) >= 0) {
        out += ("0" + (j.lowVal() & 127 | 128).toString(16)).slice(-2);
        j = j.divide(new JSBigInt(2).pow(7));
      }
      out += ("0" + j.toJSValue().toString(16)).slice(-2);
      return out;
    }
    CnUtils2.encode_varint = encode_varint;
    function encode_varint_term(i) {
      let value = new JSBigInt(i);
      let out = "";
      do {
        const byteValue = value.lowVal() & 255;
        const byte = value.compare(127) > 0 ? byteValue | 128 : byteValue;
        out += byte.toString(16).padStart(2, "0");
        value = value.divide(128);
      } while (value.compare(0) > 0);
      return out;
    }
    CnUtils2.encode_varint_term = encode_varint_term;
    function cn_fast_hash(input) {
      return concealjs.cnutils.cn_fast_hash(input);
    }
    CnUtils2.cn_fast_hash = cn_fast_hash;
    function hex_xor(hex1, hex2) {
      if (!hex1 || !hex2 || hex1.length !== hex2.length || hex1.length % 2 !== 0 || hex2.length % 2 !== 0) {
        throw "Hex string(s) is/are invalid!";
      }
      const bin1 = hextobin(hex1);
      const bin2 = hextobin(hex2);
      const xor = new Uint8Array(bin1.length);
      for (let i = 0; i < xor.length; i++) {
        xor[i] = bin1[i] ^ bin2[i];
      }
      return bintohex(xor);
    }
    CnUtils2.hex_xor = hex_xor;
    function trimRight(str, char) {
      while (str[str.length - 1] === char) str = str.slice(0, -1);
      return str;
    }
    CnUtils2.trimRight = trimRight;
    function padLeft(str, len, char) {
      while (str.length < len) {
        str = char + str;
      }
      return str;
    }
    CnUtils2.padLeft = padLeft;
    function ge_double_scalarmult_base_vartime(c, P, r) {
      if (c.length !== 64 || P.length !== 64 || r.length !== 64) {
        throw "Invalid input length!";
      }
      return concealjs.cnutils.ge_double_scalarmult_base_vartime(c, P, r);
    }
    CnUtils2.ge_double_scalarmult_base_vartime = ge_double_scalarmult_base_vartime;
    function ge_double_scalarmult_postcomp_vartime(r, P, c, I) {
      if (c.length !== 64 || P.length !== 64 || r.length !== 64 || I.length !== 64) {
        throw "Invalid input length!";
      }
      return concealjs.cnutils.ge_double_scalarmult_postcomp_vartime(r, P, c, I);
    }
    CnUtils2.ge_double_scalarmult_postcomp_vartime = ge_double_scalarmult_postcomp_vartime;
    function decompose_amount_into_digits(amount) {
      amount = amount.toString();
      const ret = [];
      while (amount.length > 0) {
        if (amount[0] !== "0") {
          let digit = amount[0];
          while (digit.length < amount.length) {
            digit += "0";
          }
          ret.push(new JSBigInt(digit));
        }
        amount = amount.slice(1);
      }
      return ret;
    }
    CnUtils2.decompose_amount_into_digits = decompose_amount_into_digits;
    function decode_rct_ecdh(ecdh, key) {
      const first = Cn.hash_to_scalar(key);
      const second = Cn.hash_to_scalar(first);
      return {
        mask: CnNativeBride.sc_sub(ecdh.mask, first),
        amount: CnNativeBride.sc_sub(ecdh.amount, second)
      };
    }
    CnUtils2.decode_rct_ecdh = decode_rct_ecdh;
    function encode_rct_ecdh(ecdh, key) {
      const first = Cn.hash_to_scalar(key);
      const second = Cn.hash_to_scalar(first);
      return {
        mask: CnNativeBride.sc_add(ecdh.mask, first),
        amount: CnNativeBride.sc_add(ecdh.amount, second)
      };
    }
    CnUtils2.encode_rct_ecdh = encode_rct_ecdh;
  })(CnUtils || (CnUtils = {}));
  var CnNativeBride;
  ((CnNativeBride2) => {
    function sc_reduce32(hex) {
      return concealjs.crypto.sc_reduce32(hex);
    }
    CnNativeBride2.sc_reduce32 = sc_reduce32;
    function derive_secret_key(derivation, out_index, sec) {
      return concealjs.crypto.derive_secret_key(derivation, out_index, sec);
    }
    CnNativeBride2.derive_secret_key = derive_secret_key;
    function hash_to_ec(key) {
      return concealjs.crypto.hash_to_ec160(key);
    }
    CnNativeBride2.hash_to_ec = hash_to_ec;
    function hash_to_ec_2(key) {
      return concealjs.crypto.hash_to_ec32(key);
    }
    CnNativeBride2.hash_to_ec_2 = hash_to_ec_2;
    function generate_key_image_2(pub, sec) {
      return concealjs.crypto.generate_key_image(pub, sec);
    }
    CnNativeBride2.generate_key_image_2 = generate_key_image_2;
    function sc_add(scalar1, scalar2) {
      return concealjs.crypto.sc_add(scalar1, scalar2);
    }
    CnNativeBride2.sc_add = sc_add;
    function sc_sub(scalar1, scalar2) {
      return concealjs.crypto.sc_sub(scalar1, scalar2);
    }
    CnNativeBride2.sc_sub = sc_sub;
    function sc_mulsub(sigc, sec, k) {
      return concealjs.crypto.sc_mulsub(sigc, sec, k);
    }
    CnNativeBride2.sc_mulsub = sc_mulsub;
    function sc_mulsub_bin(sigc_bin, sec_bin, k_bin) {
      return concealjs.crypto.sc_mulsub(
        CnUtils.bintohex(sigc_bin),
        CnUtils.bintohex(sec_bin),
        CnUtils.bintohex(k_bin)
      );
    }
    CnNativeBride2.sc_mulsub_bin = sc_mulsub_bin;
    function generate_ring_signature(prefix_hash, k_image, keys, sec, real_index) {
      if (k_image.length !== STRUCT_SIZES.KEY_IMAGE * 2) {
        throw "invalid key image length";
      }
      if (sec.length !== KEY_SIZE * 2) {
        throw "Invalid secret key length";
      }
      if (prefix_hash.length !== HASH_SIZE * 2 || !CnUtils.valid_hex(prefix_hash)) {
        throw "Invalid prefix hash";
      }
      if (real_index >= keys.length || real_index < 0) {
        throw "real_index is invalid";
      }
      return concealjs.crypto.generate_ring_signature(
        prefix_hash,
        k_image,
        keys,
        sec,
        real_index
      );
    }
    CnNativeBride2.generate_ring_signature = generate_ring_signature;
    function generate_signature(prefixHash, publicKey, secretKey) {
      if (prefixHash.length !== HASH_SIZE * 2 || !CnUtils.valid_hex(prefixHash)) {
        throw new Error("Invalid prefix hash length or format");
      }
      if (publicKey.length !== KEY_SIZE * 2 || !CnUtils.valid_hex(publicKey)) {
        throw new Error("Invalid public key length or format");
      }
      if (secretKey.length !== KEY_SIZE * 2 || !CnUtils.valid_hex(secretKey)) {
        throw new Error("Invalid secret key length or format");
      }
      return concealjs.crypto.generate_signature(prefixHash, publicKey, secretKey);
    }
    CnNativeBride2.generate_signature = generate_signature;
    function generate_key_derivation(pub, sec) {
      return concealjs.crypto.generate_key_derivation(pub, sec);
    }
    CnNativeBride2.generate_key_derivation = generate_key_derivation;
    function derive_public_key(derivation, output_idx_in_tx, pubSpend) {
      return concealjs.crypto.derive_public_key(derivation, output_idx_in_tx, pubSpend);
    }
    CnNativeBride2.derive_public_key = derive_public_key;
    function verify_signature(prefixHash, publicKey, signature) {
      if (prefixHash.length !== HASH_SIZE * 2 || !CnUtils.valid_hex(prefixHash)) {
        return false;
      }
      if (publicKey.length !== KEY_SIZE * 2 || !CnUtils.valid_hex(publicKey)) {
        return false;
      }
      if (signature.length !== STRUCT_SIZES.SIGNATURE * 2 || !CnUtils.valid_hex(signature)) {
        return false;
      }
      try {
        return concealjs.crypto.check_signature(prefixHash, publicKey, signature);
      } catch (e) {
        console.error("Error in verify_signature:", e);
        return false;
      }
    }
    CnNativeBride2.verify_signature = verify_signature;
    function checkTxProof(prefixHash, R, A, D, sig) {
      if (prefixHash.length !== HASH_SIZE * 2 || !CnUtils.valid_hex(prefixHash)) {
        return false;
      }
      if (R.length !== KEY_SIZE * 2 || !CnUtils.valid_hex(R)) {
        return false;
      }
      if (A.length !== KEY_SIZE * 2 || !CnUtils.valid_hex(A)) {
        return false;
      }
      if (D.length !== KEY_SIZE * 2 || !CnUtils.valid_hex(D)) {
        return false;
      }
      if (sig.length !== STRUCT_SIZES.SIGNATURE * 2 || !CnUtils.valid_hex(sig)) {
        return false;
      }
      try {
        return concealjs.crypto.check_tx_proof(prefixHash, R, A, D, sig);
      } catch (e) {
        console.error("Error in checkTxProof:", e);
        return false;
      }
    }
    CnNativeBride2.checkTxProof = checkTxProof;
  })(CnNativeBride || (CnNativeBride = {}));
  var Cn;
  ((Cn2) => {
    function hash_to_scalar(buf) {
      const hash = CnUtils.cn_fast_hash(buf);
      const scalar = concealjs.crypto.sc_reduce32(hash);
      return scalar;
    }
    Cn2.hash_to_scalar = hash_to_scalar;
    function array_hash_to_scalar(array) {
      let buf = "";
      for (let i = 0; i < array.length; i++) {
        if (typeof array[i] !== "string") {
          throw "unexpected array element";
        }
        buf += array[i];
      }
      return hash_to_scalar(buf);
    }
    Cn2.array_hash_to_scalar = array_hash_to_scalar;
    function generate_key_derivation(pub, sec) {
      if (pub.length !== 64 || sec.length !== 64) {
        throw "Invalid input length";
      }
      const P = CnUtils.ge_scalarmult(pub, sec);
      return CnUtils.ge_scalarmult(P, CnUtils.d2s(8));
    }
    Cn2.generate_key_derivation = generate_key_derivation;
    function derive_public_key(derivation, out_index, pub) {
      if (derivation.length !== 64 || pub.length !== 64) {
        throw "Invalid input length!";
      }
      return concealjs.crypto.derive_public_key(derivation, out_index, pub);
    }
    Cn2.derive_public_key = derive_public_key;
    function underive_public_key(derivation, out_index, pub) {
      if (derivation.length !== 64 || pub.length !== 64) {
        throw "Invalid input length!";
      }
      const s = CnUtils.derivation_to_scalar(derivation, out_index);
      return CnUtils.ge_sub(pub, CnUtils.ge_scalarmult_base(s));
    }
    Cn2.underive_public_key = underive_public_key;
    function generate_keys(seed) {
      if (seed.length !== 64) throw "Invalid input length!";
      const sec = concealjs.crypto.sc_reduce32(seed);
      const pub = concealjs.cnutils.sec_key_to_pub(sec);
      return {
        sec,
        pub
      };
    }
    Cn2.generate_keys = generate_keys;
    function random_keypair() {
      return Cn2.generate_keys(CnRandom.rand_32());
    }
    Cn2.random_keypair = random_keypair;
    function pubkeys_to_string(spend, view) {
      const prefix = CnUtils.encode_varint(CRYPTONOTE_PUBLIC_ADDRESS_BASE58_PREFIX);
      const data = prefix + spend + view;
      const checksum = CnUtils.cn_fast_hash(data);
      return cnBase58.encode(data + checksum.slice(0, ADDRESS_CHECKSUM_SIZE * 2));
    }
    Cn2.pubkeys_to_string = pubkeys_to_string;
    function create_address(seed) {
      const keys = {
        spend: {
          sec: "",
          pub: ""
        },
        view: {
          sec: "",
          pub: ""
        },
        public_addr: ""
      };
      let first;
      if (seed.length !== 64) {
        first = CnUtils.cn_fast_hash(seed);
      } else {
        first = seed;
      }
      keys.spend = Cn2.generate_keys(first);
      const second = seed.length !== 64 ? CnUtils.cn_fast_hash(first) : CnUtils.cn_fast_hash(keys.spend.sec);
      keys.view = Cn2.generate_keys(second);
      keys.public_addr = Cn2.pubkeys_to_string(keys.spend.pub, keys.view.pub);
      return keys;
    }
    Cn2.create_address = create_address;
    function decode_address(address) {
      let dec = cnBase58.decode(address);
      logDebugMsg(
        dec,
        CRYPTONOTE_PUBLIC_ADDRESS_BASE58_PREFIX,
        CRYPTONOTE_PUBLIC_INTEGRATED_ADDRESS_BASE58_PREFIX
      );
      const expectedPrefix = CnUtils.encode_varint(CRYPTONOTE_PUBLIC_ADDRESS_BASE58_PREFIX);
      const expectedPrefixInt = CnUtils.encode_varint(
        CRYPTONOTE_PUBLIC_INTEGRATED_ADDRESS_BASE58_PREFIX
      );
      const expectedPrefixSub = CnUtils.encode_varint(CRYPTONOTE_PUBLIC_SUBADDRESS_BASE58_PREFIX);
      const prefix = dec.slice(0, expectedPrefix.length);
      logDebugMsg(prefix, expectedPrefixInt, expectedPrefix);
      if (prefix !== expectedPrefix && prefix !== expectedPrefixInt && prefix !== expectedPrefixSub) {
        throw "Invalid address prefix";
      }
      dec = dec.slice(expectedPrefix.length);
      const spend = dec.slice(0, 64);
      const view = dec.slice(64, 128);
      let checksum = null;
      let expectedChecksum = null;
      let intPaymentId = null;
      if (prefix === expectedPrefixInt) {
        intPaymentId = dec.slice(128, 128 + INTEGRATED_ID_SIZE * 2);
        checksum = dec.slice(
          128 + INTEGRATED_ID_SIZE * 2,
          128 + INTEGRATED_ID_SIZE * 2 + ADDRESS_CHECKSUM_SIZE * 2
        );
        expectedChecksum = CnUtils.cn_fast_hash(prefix + spend + view + intPaymentId).slice(
          0,
          ADDRESS_CHECKSUM_SIZE * 2
        );
      } else {
        checksum = dec.slice(128, 128 + ADDRESS_CHECKSUM_SIZE * 2);
        expectedChecksum = CnUtils.cn_fast_hash(prefix + spend + view).slice(
          0,
          ADDRESS_CHECKSUM_SIZE * 2
        );
      }
      if (checksum !== expectedChecksum) {
        throw "Invalid checksum";
      }
      return {
        spend,
        view,
        intPaymentId
      };
    }
    Cn2.decode_address = decode_address;
    function is_subaddress(addr) {
      const decoded = cnBase58.decode(addr);
      const subaddressPrefix = CnUtils.encode_varint(CRYPTONOTE_PUBLIC_SUBADDRESS_BASE58_PREFIX);
      const prefix = decoded.slice(0, subaddressPrefix.length);
      return prefix === subaddressPrefix;
    }
    Cn2.is_subaddress = is_subaddress;
    function valid_keys(view_pub, view_sec, spend_pub, spend_sec) {
      const expected_view_pub = concealjs.cnutils.sec_key_to_pub(view_sec);
      const expected_spend_pub = concealjs.cnutils.sec_key_to_pub(spend_sec);
      return expected_spend_pub === spend_pub && expected_view_pub === view_pub;
    }
    Cn2.valid_keys = valid_keys;
    function try_decode_address(address) {
      try {
        decode_address(address.trim());
        return true;
      } catch {
        return false;
      }
    }
    Cn2.try_decode_address = try_decode_address;
    function build_view_only_keys(address, privateViewKey) {
      let decoded;
      try {
        decoded = decode_address(address.trim());
      } catch {
        throw new Error("Invalid address \u2014 check the ccx7 address and try again.");
      }
      const viewKey = privateViewKey.trim().toLowerCase();
      if (!/^[0-9a-f]{64}$/.test(viewKey)) {
        throw new Error("View key must be 64 hexadecimal characters.");
      }
      const derivedViewPub = CnUtils.sec_key_to_pub(viewKey);
      if (derivedViewPub !== decoded.view) {
        throw new Error("View key does not match this address.");
      }
      return {
        keys: {
          priv: { spend: "", view: viewKey },
          pub: { spend: decoded.spend, view: decoded.view }
        },
        address: pubkeys_to_string(decoded.spend, decoded.view),
        viewKey
      };
    }
    Cn2.build_view_only_keys = build_view_only_keys;
    function decrypt_payment_id(payment_id8, tx_public_key, acc_prv_view_key) {
      if (payment_id8.length !== 16) throw "Invalid input length2!";
      const key_derivation = concealjs.crypto.generate_key_derivation(
        tx_public_key,
        acc_prv_view_key
      );
      const pid_key = concealjs.crypto.cn_fast_hash(key_derivation + ENCRYPTED_PAYMENT_ID_TAIL.toString(16)).slice(0, INTEGRATED_ID_SIZE * 2);
      const decrypted_payment_id = concealjs.cnutils.hex_xor(payment_id8, pid_key);
      return decrypted_payment_id;
    }
    Cn2.decrypt_payment_id = decrypt_payment_id;
    function get_account_integrated_address(address, payment_id8) {
      const decoded_address = decode_address(address);
      const prefix = concealjs.cnutils.encode_varint(
        CRYPTONOTE_PUBLIC_INTEGRATED_ADDRESS_BASE58_PREFIX
      );
      const data = prefix + decoded_address.spend + decoded_address.view + payment_id8;
      const checksum = concealjs.cnutils.cn_fast_hash(data);
      return cnBase58.encode(data + checksum.slice(0, ADDRESS_CHECKSUM_SIZE * 2));
    }
    Cn2.get_account_integrated_address = get_account_integrated_address;
    function formatMoneyFull(units) {
      let unitsStr = units.toString();
      const symbol = unitsStr[0] === "-" ? "-" : "";
      if (symbol === "-") {
        unitsStr = unitsStr.slice(1);
      }
      let decimal;
      if (unitsStr.length >= config.coinUnitPlaces) {
        decimal = unitsStr.substr(unitsStr.length - config.coinUnitPlaces, config.coinUnitPlaces);
      } else {
        decimal = CnUtils.padLeft(unitsStr, config.coinUnitPlaces, "0");
      }
      return symbol + (unitsStr.substr(0, unitsStr.length - config.coinUnitPlaces) || "0") + "." + decimal;
    }
    Cn2.formatMoneyFull = formatMoneyFull;
    function formatMoneyFullSymbol(units) {
      return Cn2.formatMoneyFull(units) + " " + config.coinSymbol;
    }
    Cn2.formatMoneyFullSymbol = formatMoneyFullSymbol;
    function formatMoney(units) {
      const f = CnUtils.trimRight(Cn2.formatMoneyFull(units), "0");
      if (f[f.length - 1] === ".") {
        return f.slice(0, f.length - 1);
      }
      return f;
    }
    Cn2.formatMoney = formatMoney;
    function formatMoneySymbol(units) {
      return Cn2.formatMoney(units) + " " + config.coinSymbol;
    }
    Cn2.formatMoneySymbol = formatMoneySymbol;
  })(Cn || (Cn = {}));
  var CnTransactions;
  ((CnTransactions2) => {
    function commit(amount, mask) {
      if (!CnUtils.valid_hex(mask) || mask.length !== 64 || !CnUtils.valid_hex(amount) || amount.length !== 64) {
        throw "invalid amount or mask!";
      }
      const C = CnUtils.ge_double_scalarmult_base_vartime(amount, CnVars.H, mask);
      return C;
    }
    CnTransactions2.commit = commit;
    function zeroCommit(amount) {
      if (!CnUtils.valid_hex(amount) || amount.length !== 64) {
        throw "invalid amount!";
      }
      const C = CnUtils.ge_double_scalarmult_base_vartime(amount, CnVars.H, CnVars.I);
      return C;
    }
    CnTransactions2.zeroCommit = zeroCommit;
    function decodeRctSimple(rv, sk, i) {
      const ecdh_info = CnUtils.decode_rct_ecdh(rv.ecdhInfo[i], sk);
      const amount = ecdh_info.amount;
      return CnUtils.h2d(amount);
    }
    CnTransactions2.decodeRctSimple = decodeRctSimple;
    function decode_ringct(rv, pub, sec, i, amount, derivation) {
      if (derivation === null) derivation = CnNativeBride.generate_key_derivation(pub, sec);
      const scalar1 = CnUtils.derivation_to_scalar(derivation, i);
      try {
        switch (rv.type) {
          case 2 /* Simple */:
            amount = CnTransactions2.decodeRctSimple(rv, scalar1, i);
            break;
          case 1 /* Full */:
            amount = CnTransactions2.decodeRctSimple(rv, scalar1, i);
            break;
          case 4 /* SimpleBulletproof */:
            amount = CnTransactions2.decodeRctSimple(rv, scalar1, i);
            break;
          case 3 /* FullBulletproof */:
            amount = CnTransactions2.decodeRctSimple(rv, scalar1, i);
            break;
          default:
            logDebugMsg("Unsupported rc type", rv.type);
            return false;
        }
      } catch (e) {
        console.error(e);
        logDebugMsg("Failed to decode input " + i);
        return false;
      }
      return amount;
    }
    CnTransactions2.decode_ringct = decode_ringct;
    function generate_key_image_helper(ack, tx_public_key, real_output_index, recv_derivation) {
      if (recv_derivation === null)
        recv_derivation = concealjs.crypto.generate_key_derivation(
          tx_public_key,
          ack.view_secret_key
        );
      const in_ephemeral_pub = concealjs.crypto.derive_public_key(
        recv_derivation,
        real_output_index,
        ack.public_spend_key
      );
      const in_ephemeral_sec = concealjs.crypto.derive_secret_key(
        recv_derivation,
        real_output_index,
        ack.spend_secret_key
      );
      const ki = concealjs.crypto.generate_key_image(in_ephemeral_pub, in_ephemeral_sec);
      return {
        ephemeral_pub: in_ephemeral_pub,
        ephemeral_sec: in_ephemeral_sec,
        key_image: ki
      };
    }
    CnTransactions2.generate_key_image_helper = generate_key_image_helper;
    function generate_key_image_helper_rct(keys, tx_pub_key, out_index, enc_mask) {
      const recv_derivation = CnNativeBride.generate_key_derivation(tx_pub_key, keys.view.sec);
      if (!recv_derivation) throw "Failed to generate key image";
      let mask;
      if (enc_mask === CnVars.I) {
        mask = enc_mask;
      } else {
        const temp0 = CnUtils.derivation_to_scalar(recv_derivation, out_index);
        const temp1 = Cn.hash_to_scalar(temp0);
        mask = enc_mask ? CnNativeBride.sc_sub(enc_mask, temp1) : CnVars.I;
      }
      const ephemeral_pub = CnNativeBride.derive_public_key(
        recv_derivation,
        out_index,
        keys.spend.pub
      );
      if (!ephemeral_pub) throw "Failed to generate key image";
      const ephemeral_sec = CnNativeBride.derive_secret_key(
        recv_derivation,
        out_index,
        keys.spend.sec
      );
      const image = concealjs.crypto.generate_key_image(ephemeral_pub, ephemeral_sec);
      return {
        in_ephemeral: {
          pub: ephemeral_pub,
          sec: ephemeral_sec,
          mask
        },
        image
      };
    }
    CnTransactions2.generate_key_image_helper_rct = generate_key_image_helper_rct;
    function estimateRctSize(inputs, mixin, outputs) {
      let size = 0;
      size += outputs * 6306;
      size += ((mixin + 1) * 4 + 32 + 8) * inputs;
      size += 64 * (mixin + 1) * inputs + 64 * inputs;
      size += 74;
      return size;
    }
    CnTransactions2.estimateRctSize = estimateRctSize;
    function decompose_tx_destinations(dsts, rct) {
      const out = [];
      if (rct) {
        for (let i = 0; i < dsts.length; i++) {
          out.push({
            address: dsts[i].address,
            amount: dsts[i].amount
          });
        }
      } else {
        for (let i = 0; i < dsts.length; i++) {
          const digits = CnUtils.decompose_amount_into_digits(dsts[i].amount);
          for (let j = 0; j < digits.length; j++) {
            if (digits[j].compare(0) > 0) {
              out.push({
                address: dsts[i].address,
                amount: digits[j]
              });
            }
          }
        }
      }
      return out.sort((a, b) => a["amount"] - b["amount"]);
    }
    CnTransactions2.decompose_tx_destinations = decompose_tx_destinations;
    function get_payment_id_nonce(payment_id, pid_encrypt) {
      if (payment_id.length !== 64 && payment_id.length !== 16) {
        throw "Invalid payment id";
      }
      let res = "";
      if (pid_encrypt) {
        res += TX_EXTRA_NONCE_TAGS.ENCRYPTED_PAYMENT_ID;
      } else {
        res += TX_EXTRA_NONCE_TAGS.PAYMENT_ID;
      }
      res += payment_id;
      return res;
    }
    CnTransactions2.get_payment_id_nonce = get_payment_id_nonce;
    function abs_to_rel_offsets(offsets) {
      if (offsets.length === 0) return offsets;
      for (let i = offsets.length - 1; i >= 1; --i) {
        offsets[i] = new JSBigInt(offsets[i]).subtract(offsets[i - 1]).toString();
      }
      return offsets;
    }
    CnTransactions2.abs_to_rel_offsets = abs_to_rel_offsets;
    function add_pub_key_to_extra(extra, pubkey) {
      if (pubkey.length !== 64) throw "Invalid pubkey length";
      extra += TX_EXTRA_TAGS.PUBKEY + pubkey;
      return extra;
    }
    CnTransactions2.add_pub_key_to_extra = add_pub_key_to_extra;
    function add_additionnal_pub_keys_to_extra(extra, keys) {
      logDebugMsg("Add additionnal keys to extra", keys);
      if (keys.length === 0) return extra;
      extra += TX_EXTRA_TAGS.ADDITIONAL_PUBKEY;
      extra += ("0" + keys.length.toString(16)).slice(-2);
      for (const key of keys) {
        if (key.length !== 64) throw "Invalid pubkey length";
        extra += key;
      }
      return extra;
    }
    CnTransactions2.add_additionnal_pub_keys_to_extra = add_additionnal_pub_keys_to_extra;
    function add_nonce_to_extra(extra, nonce) {
      if (nonce.length % 2 !== 0) {
        throw "Invalid extra nonce";
      }
      if (nonce.length / 2 > TX_EXTRA_NONCE_MAX_COUNT) {
        throw "Extra nonce must be at most " + TX_EXTRA_NONCE_MAX_COUNT + " bytes";
      }
      extra += TX_EXTRA_TAGS.NONCE;
      extra += ("0" + (nonce.length / 2).toString(16)).slice(-2);
      extra += nonce;
      return extra;
    }
    CnTransactions2.add_nonce_to_extra = add_nonce_to_extra;
    function serialize_tx(tx, headeronly = false) {
      logDebugMsg("serialize tx ", JSON.parse(JSON.stringify(tx)));
      let buf = "";
      buf += CnUtils.encode_varint(tx.version);
      buf += CnUtils.encode_varint(tx.unlock_time);
      buf += CnUtils.encode_varint(tx.vin.length);
      let i, j;
      for (i = 0; i < tx.vin.length; i++) {
        const vin = tx.vin[i];
        logDebugMsg("start vin", vin);
        switch (vin.type) {
          case "input_to_key":
            buf += "02";
            buf += CnUtils.encode_varint(vin.amount);
            buf += CnUtils.encode_varint(vin.key_offsets.length);
            logDebugMsg(vin.key_offsets, vin.key_offsets.length);
            for (j = 0; j < vin.key_offsets.length; j++) {
              logDebugMsg(j, vin.key_offsets[j]);
              buf += CnUtils.encode_varint(vin.key_offsets[j]);
            }
            buf += vin.k_image;
            break;
          case "input_to_deposit_key":
            buf += "03";
            buf += CnUtils.encode_varint(vin.amount);
            buf += CnUtils.encode_varint(1);
            buf += CnUtils.encode_varint(vin.outputIndex || 0);
            buf += CnUtils.encode_varint(vin.term || 0);
            break;
          default:
            throw "Unhandled vin type: " + vin.type;
        }
        logDebugMsg("end vin", vin);
      }
      logDebugMsg("serialize tx ", tx);
      buf += CnUtils.encode_varint(tx.vout.length);
      for (i = 0; i < tx.vout.length; i++) {
        const vout = tx.vout[i];
        buf += CnUtils.encode_varint(vout.amount);
        switch (vout.target.type) {
          case "txout_to_key":
            buf += "02";
            buf += vout.target.data.key;
            break;
          case "txout_to_deposit_key":
            buf += "03";
            const keys = vout.target.data.keys || [];
            buf += CnUtils.encode_varint(keys.length);
            for (let i2 = 0; i2 < keys.length; i2++) {
              buf += keys[i2];
            }
            buf += CnUtils.encode_varint(1);
            buf += CnUtils.encode_varint_term(vout.target.data.term || 0);
            break;
          default:
            throw "Unhandled txout target type: " + vout.target.type;
        }
      }
      logDebugMsg("serialize tx ", tx);
      if (!CnUtils.valid_hex(tx.extra)) {
        throw "Tx extra has invalid hex";
      }
      logDebugMsg("serialize tx ", tx);
      buf += CnUtils.encode_varint(tx.extra.length / 2);
      buf += tx.extra;
      if (!headeronly) {
        if (tx.vin.length !== tx.signatures.length) {
          throw "Signatures length != vin length";
        }
        for (i = 0; i < tx.vin.length; i++) {
          const vin = tx.vin[i];
          let expectedSignatures;
          if (vin.type === "input_to_deposit_key") {
            expectedSignatures = vin.signatures;
          } else if (vin.type === "input_to_key") {
            expectedSignatures = vin.key_offsets.length;
          } else {
            expectedSignatures = 0;
          }
          if (tx.signatures[i].length !== expectedSignatures) {
            throw `Unexpected signature count for input ${i}: expected ${expectedSignatures}, got ${tx.signatures[i].length}`;
          }
          for (j = 0; j < tx.signatures[i].length; j++) {
            buf += tx.signatures[i][j];
          }
        }
      }
      logDebugMsg("serialize tx ", buf);
      return buf;
    }
    CnTransactions2.serialize_tx = serialize_tx;
    function serialize_tx_with_hash(tx) {
      var hashes = "";
      var buf = "";
      buf += CnTransactions2.serialize_tx(tx, false);
      hashes += CnUtils.cn_fast_hash(buf);
      return {
        raw: buf,
        hash: hashes,
        prvkey: tx.prvkey
      };
    }
    CnTransactions2.serialize_tx_with_hash = serialize_tx_with_hash;
    function serialize_rct_tx_with_hash(tx) {
      let hashes = "";
      let buf = "";
      buf += CnTransactions2.serialize_tx(tx, true);
      hashes += CnUtils.cn_fast_hash(buf);
      const buf2 = CnTransactions2.serialize_rct_base(tx.rct_signatures);
      hashes += CnUtils.cn_fast_hash(buf2);
      buf += buf2;
      let buf3 = serializeRangeProofs(tx.rct_signatures);
      const p = tx.rct_signatures.p;
      if (p)
        for (let i = 0; i < p.MGs.length; i++) {
          for (let j = 0; j < p.MGs[i].ss.length; j++) {
            buf3 += p.MGs[i].ss[j][0];
            buf3 += p.MGs[i].ss[j][1];
          }
          buf3 += p.MGs[i].cc;
        }
      hashes += CnUtils.cn_fast_hash(buf3);
      buf += buf3;
      const hash = CnUtils.cn_fast_hash(hashes);
      return {
        raw: buf,
        hash,
        prvkey: tx.prvkey
      };
    }
    CnTransactions2.serialize_rct_tx_with_hash = serialize_rct_tx_with_hash;
    function get_tx_prefix_hash(tx) {
      const prefix = CnTransactions2.serialize_tx(tx, true);
      return CnUtils.cn_fast_hash(prefix);
    }
    CnTransactions2.get_tx_prefix_hash = get_tx_prefix_hash;
    function genBorromean(xv, pm, iv, size, nrings) {
      if (xv.length !== nrings) {
        throw "wrong xv length " + xv.length;
      }
      if (pm.length !== size) {
        throw "wrong pm size " + pm.length;
      }
      for (let i = 0; i < pm.length; i++) {
        if (pm[i].length !== nrings) {
          throw "wrong pm[" + i + "] length " + pm[i].length;
        }
      }
      if (iv.length !== nrings) {
        throw "wrong iv length " + iv.length;
      }
      for (let i = 0; i < iv.length; i++) {
        if (parseInt(iv[i]) >= size) {
          throw "bad indices value at: " + i + ": " + iv[i];
        }
      }
      const bb = {
        s: [],
        ee: ""
      };
      const L = [];
      for (let i = 0; i < size; i++) {
        bb.s[i] = [];
        L[i] = [];
      }
      let index;
      const alpha = [];
      for (let i = 0; i < nrings; i++) {
        index = parseInt("" + iv[i]);
        alpha[i] = CnRandom.random_scalar();
        L[index][i] = CnUtils.ge_scalarmult_base(alpha[i]);
        for (let j = index + 1; j < size; j++) {
          bb.s[j][i] = CnRandom.random_scalar();
          const c = Cn.hash_to_scalar(L[j - 1][i]);
          L[j][i] = CnUtils.ge_double_scalarmult_base_vartime(c, pm[j][i], bb.s[j][i]);
        }
      }
      let ltemp = "";
      for (let i = 0; i < nrings; i++) {
        ltemp += L[size - 1][i];
      }
      bb.ee = Cn.hash_to_scalar(ltemp);
      for (let i = 0; i < nrings; i++) {
        let cc = bb.ee;
        let j = 0;
        for (j = 0; j < parseInt(iv[i]); j++) {
          bb.s[j][i] = CnRandom.random_scalar();
          const LL = CnUtils.ge_double_scalarmult_base_vartime(cc, pm[j][i], bb.s[j][i]);
          cc = Cn.hash_to_scalar(LL);
        }
        bb.s[j][i] = CnNativeBride.sc_mulsub(xv[i], cc, alpha[i]);
      }
      return bb;
    }
    CnTransactions2.genBorromean = genBorromean;
    function proveRange(commitMaskObj, amount, nrings) {
      const size = 2;
      let C = CnVars.I;
      let mask = CnVars.Z;
      const indices = CnUtils.d2b(amount);
      const sig = {
        Ci: [],
        bsig: {
          s: [],
          ee: ""
        }
        //exp: exponent //doesn't exist for now
      };
      const ai = [];
      const PM = [];
      for (let i = 0; i < size; i++) {
        PM[i] = [];
      }
      for (let i = 0; i < nrings; i++) {
        ai[i] = CnRandom.random_scalar();
        let j = parseInt(indices[i]);
        PM[j][i] = CnUtils.ge_scalarmult_base(ai[i]);
        while (j > 0) {
          j--;
          PM[j][i] = CnUtils.ge_add(PM[j + 1][i], CnVars.H2[i]);
        }
        j = parseInt(indices[i]);
        while (j < size - 1) {
          j++;
          PM[j][i] = CnUtils.ge_sub(PM[j - 1][i], CnVars.H2[i]);
        }
        mask = CnNativeBride.sc_add(mask, ai[i]);
      }
      for (let i = 0; i < nrings; i++) {
        sig.Ci[i] = PM[0][i];
        C = CnUtils.ge_add(C, PM[0][i]);
      }
      sig.bsig = CnTransactions2.genBorromean(ai, PM, indices, size, nrings);
      commitMaskObj.C = C;
      commitMaskObj.mask = mask;
      return sig;
    }
    CnTransactions2.proveRange = proveRange;
    function MLSAG_Gen(message, pk, xx, kimg, index) {
      const cols = pk.length;
      if (index >= cols) {
        throw "index out of range";
      }
      const rows = pk[0].length;
      if (rows !== 2) {
        throw "wrong row count";
      }
      for (let i2 = 0; i2 < cols; i2++) {
        if (pk[i2].length !== rows) {
          throw "pk is not rectangular";
        }
      }
      if (xx.length !== rows) {
        throw "bad xx size";
      }
      let c_old = "";
      const alpha = [];
      const rv = {
        ss: [],
        cc: ""
      };
      for (let i2 = 0; i2 < cols; i2++) {
        rv.ss[i2] = [];
      }
      const toHash = [];
      toHash[0] = message;
      alpha[0] = CnRandom.random_scalar();
      toHash[1] = pk[index][0];
      toHash[2] = CnUtils.ge_scalarmult_base(alpha[0]);
      toHash[3] = CnNativeBride.generate_key_image_2(pk[index][0], alpha[0]);
      alpha[1] = CnRandom.random_scalar();
      toHash[4] = pk[index][1];
      toHash[5] = CnUtils.ge_scalarmult_base(alpha[1]);
      c_old = Cn.array_hash_to_scalar(toHash);
      let i = (index + 1) % cols;
      if (i === 0) {
        rv.cc = c_old;
      }
      while (i !== index) {
        rv.ss[i][0] = CnRandom.random_scalar();
        rv.ss[i][1] = CnRandom.random_scalar();
        toHash[1] = pk[i][0];
        toHash[2] = CnUtils.ge_double_scalarmult_base_vartime(c_old, pk[i][0], rv.ss[i][0]);
        toHash[3] = CnUtils.ge_double_scalarmult_postcomp_vartime(rv.ss[i][0], pk[i][0], c_old, kimg);
        toHash[4] = pk[i][1];
        toHash[5] = CnUtils.ge_double_scalarmult_base_vartime(c_old, pk[i][1], rv.ss[i][1]);
        c_old = Cn.array_hash_to_scalar(toHash);
        i = (i + 1) % cols;
        if (i === 0) {
          rv.cc = c_old;
        }
      }
      for (i = 0; i < rows; i++) {
        rv.ss[index][i] = CnNativeBride.sc_mulsub(c_old, xx[i], alpha[i]);
      }
      return rv;
    }
    CnTransactions2.MLSAG_Gen = MLSAG_Gen;
    function proveRctMG(message, pubs, inSk, kimg, mask, Cout, index) {
      const cols = pubs.length;
      if (cols < 3) {
        throw "cols must be > 2 (mixin)";
      }
      const xx = [];
      const PK = [];
      for (let i = 0; i < cols; i++) {
        PK[i] = [];
        PK[i][0] = pubs[i].dest;
        PK[i][1] = CnUtils.ge_sub(pubs[i].mask, Cout);
      }
      xx[0] = inSk.x;
      xx[1] = CnNativeBride.sc_sub(inSk.a, mask);
      return CnTransactions2.MLSAG_Gen(message, PK, xx, kimg, index);
    }
    CnTransactions2.proveRctMG = proveRctMG;
    function serialize_rct_base(rv) {
      let buf = "";
      buf += CnUtils.encode_varint(rv.type);
      buf += CnUtils.encode_varint(rv.txnFee);
      if (rv.type === 2) {
        for (let i = 0; i < rv.pseudoOuts.length; i++) {
          buf += rv.pseudoOuts[i];
        }
      }
      if (rv.ecdhInfo.length !== rv.outPk.length) {
        throw "mismatched outPk/ecdhInfo!";
      }
      for (let i = 0; i < rv.ecdhInfo.length; i++) {
        buf += rv.ecdhInfo[i].mask;
        buf += rv.ecdhInfo[i].amount;
      }
      for (let i = 0; i < rv.outPk.length; i++) {
        buf += rv.outPk[i];
      }
      return buf;
    }
    CnTransactions2.serialize_rct_base = serialize_rct_base;
    function serializeRangeProofs(rv) {
      const buf = "";
      const p = rv.p;
      if (p) {
        if (p.rangeSigs.length) return CnTransactions2.serializeRangeProofsClassic(rv);
        else if (p.bulletproofs.length) return CnTransactions2.serializeRangeProofsBulletproof(rv);
        else throw new Error(" missing range proof or bulletproof range proof");
      } else throw new Error("invalid p signature");
      return buf;
    }
    CnTransactions2.serializeRangeProofs = serializeRangeProofs;
    function serializeRangeProofsClassic(rv) {
      let buf = "";
      const p = rv.p;
      if (p?.rangeSigs.length)
        for (let i = 0; i < p.rangeSigs.length; i++) {
          for (let j = 0; j < p.rangeSigs[i].bsig.s.length; j++) {
            for (let l = 0; l < p.rangeSigs[i].bsig.s[j].length; l++) {
              buf += p.rangeSigs[i].bsig.s[j][l];
            }
          }
          buf += p.rangeSigs[i].bsig.ee;
          for (let j = 0; j < p.rangeSigs[i].Ci.length; j++) {
            buf += p.rangeSigs[i].Ci[j];
          }
        }
      else throw new Error("invalid p signature. missing range proof");
      return buf;
    }
    CnTransactions2.serializeRangeProofsClassic = serializeRangeProofsClassic;
    function serializeRangeProofsBulletproof(rv) {
      const buf = "";
      const p = rv.p;
      if (p)
        for (let i = 0; i < p.bulletproofs.length; i++) {
          throw new Error("bulletproof serialization not implemented");
        }
      else throw new Error("invalid p signature. missing bulletproof range proof");
      return buf;
    }
    CnTransactions2.serializeRangeProofsBulletproof = serializeRangeProofsBulletproof;
    function get_pre_mlsag_hash(rv) {
      let hashes = "";
      hashes += rv.message;
      hashes += CnUtils.cn_fast_hash(CnTransactions2.serialize_rct_base(rv));
      const buf = CnTransactions2.serializeRangeProofs(rv);
      hashes += CnUtils.cn_fast_hash(buf);
      return CnUtils.cn_fast_hash(hashes);
    }
    CnTransactions2.get_pre_mlsag_hash = get_pre_mlsag_hash;
    function genRct(message, inSk, kimg, inAmounts, outAmounts, mixRing, amountKeys, indices, txnFee, bulletproof = false) {
      logDebugMsg("MIXIN:", mixRing);
      if (outAmounts.length !== amountKeys.length) {
        throw "different number of amounts/amount_keys";
      }
      for (let i = 0; i < mixRing.length; i++) {
        if (mixRing[i].length <= indices[i]) {
          throw "bad mixRing/index size";
        }
      }
      if (mixRing.length !== inSk.length) {
        throw "mismatched mixRing/inSk";
      }
      if (inAmounts.length !== inSk.length) {
        throw "mismatched inAmounts/inSk";
      }
      if (indices.length !== inSk.length) {
        throw "mismatched indices/inSk";
      }
      logDebugMsg("======t");
      const rv = {
        type: inSk.length === 1 ? 1 /* Full */ : 2 /* Simple */,
        message,
        outPk: [],
        p: {
          rangeSigs: [],
          bulletproofs: [],
          MGs: []
        },
        ecdhInfo: [],
        txnFee: txnFee.toString(),
        pseudoOuts: []
      };
      let sumout = CnVars.Z;
      const cmObj = {
        C: "",
        mask: ""
      };
      logDebugMsg("====a");
      const p = rv.p;
      if (p) {
        const nrings = 64;
        for (let i = 0; i < outAmounts.length; i++) {
          const teststart = Date.now();
          if (!bulletproof) p.rangeSigs[i] = CnTransactions2.proveRange(cmObj, outAmounts[i], nrings);
          const testfinish = Date.now() - teststart;
          logDebugMsg("Time take for range proof " + i + ": " + testfinish);
          rv.outPk[i] = cmObj.C;
          sumout = CnNativeBride.sc_add(sumout, cmObj.mask);
          rv.ecdhInfo[i] = CnUtils.encode_rct_ecdh(
            { mask: cmObj.mask, amount: CnUtils.d2s(outAmounts[i]) },
            amountKeys[i]
          );
        }
        logDebugMsg("====a");
        logDebugMsg("-----------rv type", rv.type);
        if (rv.type === 2 /* Simple */) {
          const ai = [];
          let sumpouts = CnVars.Z;
          let i = 0;
          for (; i < inAmounts.length - 1; i++) {
            ai[i] = CnRandom.random_scalar();
            sumpouts = CnNativeBride.sc_add(sumpouts, ai[i]);
            rv.pseudoOuts[i] = commit(CnUtils.d2s(inAmounts[i]), ai[i]);
          }
          ai[i] = CnNativeBride.sc_sub(sumout, sumpouts);
          rv.pseudoOuts[i] = commit(CnUtils.d2s(inAmounts[i]), ai[i]);
          const full_message = CnTransactions2.get_pre_mlsag_hash(rv);
          for (let i2 = 0; i2 < inAmounts.length; i2++) {
            p.MGs.push(
              CnTransactions2.proveRctMG(
                full_message,
                mixRing[i2],
                inSk[i2],
                kimg[i2],
                ai[i2],
                rv.pseudoOuts[i2],
                indices[i2]
              )
            );
          }
        } else {
          let sumC = CnVars.I;
          for (let i = 0; i < rv.outPk.length; i++) {
            sumC = CnUtils.ge_add(sumC, rv.outPk[i]);
          }
          sumC = CnUtils.ge_add(sumC, CnUtils.ge_scalarmult(CnVars.H, CnUtils.d2s(rv.txnFee)));
          const full_message = CnTransactions2.get_pre_mlsag_hash(rv);
          p.MGs.push(
            CnTransactions2.proveRctMG(
              full_message,
              mixRing[0],
              inSk[0],
              kimg[0],
              sumout,
              sumC,
              indices[0]
            )
          );
        }
      }
      return rv;
    }
    CnTransactions2.genRct = genRct;
    function construct_tx(keys, sources, dsts, _senderAddress, fee_amount, payment_id, pid_encrypt, realDestViewKey, unlock_time = 0, rct, message, messageTo, ttl, transactionType, term) {
      try {
        console.log("Starting transaction construction...");
        const txkey = Cn.random_keypair();
        logDebugMsg(txkey);
        let extra = "";
        if (payment_id) {
          if (pid_encrypt && payment_id.length !== INTEGRATED_ID_SIZE * 2) {
            throw "payment ID must be " + INTEGRATED_ID_SIZE + " bytes to be encrypted!";
          }
          logDebugMsg("Adding payment id: " + payment_id);
          if (pid_encrypt && realDestViewKey) {
            const pid_key = CnUtils.cn_fast_hash(
              Cn.generate_key_derivation(realDestViewKey, txkey.sec) + ENCRYPTED_PAYMENT_ID_TAIL.toString(16)
            ).slice(0, INTEGRATED_ID_SIZE * 2);
            logDebugMsg("Txkeys:", txkey, "Payment ID key:", pid_key);
            payment_id = CnUtils.hex_xor(payment_id, pid_key);
          }
          const nonce = CnTransactions2.get_payment_id_nonce(payment_id, pid_encrypt);
          logDebugMsg("Extra nonce: " + nonce);
          extra = CnTransactions2.add_nonce_to_extra(extra, nonce);
        }
        const tx = {
          unlock_time,
          version: rct ? CURRENT_TX_VERSION : OLD_TX_VERSION,
          extra,
          prvkey: "",
          vin: [],
          vout: [],
          rct_signatures: {
            ecdhInfo: [],
            outPk: [],
            pseudoOuts: [],
            txnFee: "",
            type: 0
          },
          signatures: []
        };
        if (rct) {
          tx.rct_signatures = {
            ecdhInfo: [],
            outPk: [],
            pseudoOuts: [],
            txnFee: "",
            type: 0
          };
        } else {
          tx.signatures = [];
        }
        if (transactionType !== "regular") {
          tx.version = DEPOSIT_TX_VERSION;
        }
        tx.prvkey = txkey.sec;
        const in_contexts = [];
        let inputs_money = JSBigInt.ZERO;
        let i, j;
        logDebugMsg("Sources: ");
        if (transactionType !== "withdraw") {
          for (i = 0; i < sources.length; i++) {
            logDebugMsg(i + ": " + Cn.formatMoneyFull(sources[i].amount));
            if (sources[i].real_out >= sources[i].outputs.length) {
              throw "real index >= outputs.length";
            }
            const res = CnTransactions2.generate_key_image_helper_rct(
              keys,
              sources[i].real_out_tx_key,
              sources[i].real_out_in_tx,
              sources[i].mask
            );
            logDebugMsg("res.in_ephemeral.pub", res, res.in_ephemeral.pub, sources, i);
            if (res.in_ephemeral.pub !== sources[i].outputs[sources[i].real_out].key) {
              throw "in_ephemeral.pub != source.real_out.key";
            }
            sources[i].key_image = res.image;
            sources[i].in_ephemeral = res.in_ephemeral;
          }
          sources.sort(
            (a, b) => JSBigInt.parse(a.key_image, 16).compare(JSBigInt.parse(b.key_image, 16)) * -1
          );
        }
        for (i = 0; i < sources.length; i++) {
          inputs_money = inputs_money.add(sources[i].amount);
          in_contexts.push(sources[i].in_ephemeral);
          let input_to_key;
          if (transactionType === "withdraw") {
            input_to_key = {
              type: "input_to_deposit_key",
              term,
              amount: sources[i].amount,
              k_image: sources[i].key_image,
              // NOT USED WON'T BE SERIALIZED ANYWAY
              key_offsets: [],
              signatures: 1,
              outputIndex: sources[i].real_out_in_tx
            };
          } else {
            input_to_key = {
              type: "input_to_key",
              amount: sources[i].amount,
              k_image: sources[i].key_image,
              key_offsets: []
            };
            for (j = 0; j < sources[i].outputs.length; ++j) {
              logDebugMsg("add to key offsets", sources[i].outputs[j].index, j, sources[i].outputs);
              input_to_key.key_offsets.push(sources[i].outputs[j].index);
            }
            logDebugMsg("key offsets before abs", input_to_key.key_offsets);
            input_to_key.key_offsets = CnTransactions2.abs_to_rel_offsets(input_to_key.key_offsets);
            logDebugMsg("key offsets after abs", input_to_key.key_offsets);
          }
          tx.vin.push(input_to_key);
        }
        let outputs_money = JSBigInt.ZERO;
        let out_index = 0;
        const amountKeys = [];
        let num_stdaddresses = 0;
        let num_subaddresses = 0;
        let single_dest_subaddress = "";
        const unique_dst_addresses = {};
        for (i = 0; i < dsts.length; ++i) {
          if (new JSBigInt(dsts[i].amount).compare(0) < 0) {
            throw "dst.amount < 0";
          }
          const destKeys = Cn.decode_address(dsts[i].address);
          if (destKeys.view === keys.view.pub)
            continue;
          if (typeof unique_dst_addresses[dsts[i].address] === "undefined") {
            unique_dst_addresses[dsts[i].address] = 1;
            if (Cn.is_subaddress(dsts[i].address)) {
              ++num_subaddresses;
              single_dest_subaddress = dsts[i].address;
            } else {
              ++num_stdaddresses;
            }
          }
        }
        logDebugMsg("Destinations resume:", unique_dst_addresses, num_stdaddresses, num_subaddresses);
        if (num_stdaddresses === 0 && num_subaddresses === 1) {
          const uniqueSubaddressDecoded = Cn.decode_address(single_dest_subaddress);
          txkey.pub = CnUtils.ge_scalarmult(uniqueSubaddressDecoded.spend, txkey.sec);
        }
        const additional_tx_keys = [];
        const additional_tx_public_keys = [];
        const need_additional_txkeys = num_subaddresses > 0 && (num_stdaddresses > 0 || num_subaddresses > 1);
        for (i = 0; i < dsts.length; ++i) {
          const destKeys = Cn.decode_address(dsts[i].address);
          let additional_txkey = { sec: "", pub: "" };
          if (need_additional_txkeys) {
            additional_txkey = Cn.random_keypair();
            if (Cn.is_subaddress(dsts[i].address)) {
              additional_txkey.pub = CnUtils.ge_scalarmult(destKeys.spend, additional_txkey.sec);
            } else additional_txkey.pub = CnUtils.ge_scalarmult_base(additional_txkey.sec);
          }
          let out_derivation;
          if (destKeys.view === keys.view.pub) {
            out_derivation = Cn.generate_key_derivation(txkey.pub, keys.view.sec);
          } else {
            if (Cn.is_subaddress(dsts[i].address) && need_additional_txkeys)
              out_derivation = Cn.generate_key_derivation(destKeys.view, additional_txkey.sec);
            else out_derivation = Cn.generate_key_derivation(destKeys.view, txkey.sec);
          }
          if (need_additional_txkeys) {
            additional_tx_public_keys.push(additional_txkey.pub);
            additional_tx_keys.push(additional_txkey.sec);
          }
          if (rct) {
            amountKeys.push(CnUtils.derivation_to_scalar(out_derivation, out_index));
          }
          let out_ephemeral_pub = Cn.derive_public_key(out_derivation, out_index, destKeys.spend);
          if (transactionType === "deposit" && i === 0) {
            const depositOut = {
              amount: dsts[i].amount,
              // dsts[0].amount = amount_to_deposit
              target: {
                type: "txout_to_deposit_key",
                data: {
                  keys: [out_ephemeral_pub],
                  required_signatures: 1,
                  term
                }
              }
            };
            tx.vout.push(depositOut);
            outputs_money = outputs_money.add(new JSBigInt(dsts[i].amount));
            ++out_index;
            ++i;
            out_ephemeral_pub = Cn.derive_public_key(out_derivation, out_index, destKeys.spend);
          }
          const out = {
            amount: dsts[i].amount,
            target: {
              type: "txout_to_key",
              data: {
                key: out_ephemeral_pub
              }
            }
          };
          tx.vout.push(out);
          outputs_money = outputs_money.add(new JSBigInt(dsts[i].amount));
          ++out_index;
        }
        tx.extra = CnTransactions2.add_pub_key_to_extra(tx.extra, txkey.pub);
        tx.extra = CnTransactions2.add_additionnal_pub_keys_to_extra(
          tx.extra,
          additional_tx_public_keys
        );
        if (message) {
          const messageAddress = messageTo;
          if (messageAddress) {
            const destKeys = Cn.decode_address(messageAddress);
            const derivation = CnNativeBride.generate_key_derivation(
              destKeys.spend,
              txkey.sec
            );
            const magick1 = "80";
            const magick2 = "00";
            const keyData = derivation + magick1 + magick2;
            const hash = CnUtils.cn_fast_hash(keyData);
            const hashBuf = CnUtils.hextobin(hash);
            const nonceBuf = new Uint8Array(12);
            const index = 0;
            for (let i2 = 0; i2 < 12; i2++) {
              nonceBuf.set([index / 256 ** i2], 11 - i2);
            }
            const rawMessArr = new TextEncoder().encode(message);
            const rawMessArrFull = new Uint8Array(rawMessArr.length + 4);
            rawMessArrFull.set(rawMessArr);
            rawMessArrFull.set([0, 0, 0, 0], rawMessArr.length);
            const cha = new JSChaCha8(hashBuf, nonceBuf);
            const _buf = cha.encrypt(rawMessArrFull);
            const encryptedMessStr = CnUtils.bintohex(_buf);
            tx.extra += TX_EXTRA_TAGS.MESSAGE_TAG;
            tx.extra += ("0" + rawMessArrFull.length.toString(16)).slice(-2);
            tx.extra += encryptedMessStr;
          }
        }
        if (ttl !== 0) {
          const ttlStr = CnUtils.encode_varint(ttl);
          const ttlSize = CnUtils.encode_varint(ttlStr.length / 2);
          tx.extra = tx.extra + TX_EXTRA_TAGS.TTL_TAG + ttlSize + ttlStr;
        }
        const balanceOk = ttl !== 0 ? outputs_money.compare(inputs_money) <= 0 : outputs_money.add(fee_amount).compare(inputs_money) <= 0;
        if (transactionType !== "withdraw" && !balanceOk) {
          throw "outputs money (" + Cn.formatMoneyFull(outputs_money) + (ttl === 0 ? ") + fee (" + Cn.formatMoneyFull(fee_amount) + ")" : ")") + " > inputs money (" + Cn.formatMoneyFull(inputs_money) + ")";
        }
        if (!rct) {
          for (i = 0; i < sources.length; ++i) {
            const src_keys = [];
            for (j = 0; j < sources[i].outputs.length; ++j) {
              src_keys.push(sources[i].outputs[j].key);
            }
            if (transactionType !== "withdraw") {
              const sigs = CnNativeBride.generate_ring_signature(
                CnTransactions2.get_tx_prefix_hash(tx),
                tx.vin[i].k_image,
                src_keys,
                in_contexts[i].sec,
                sources[i].real_out
              );
              tx.signatures.push(sigs);
            } else {
              const txPrefixHash = CnTransactions2.get_tx_prefix_hash(tx);
              const derivation = CnNativeBride.generate_key_derivation(
                sources[i].real_out_tx_key,
                // sourceTransactionKey
                keys.view.sec
                // accountKeys.viewSecretKey
              );
              const ephemeralPublicKey = CnNativeBride.derive_public_key(
                derivation,
                // derivation
                parseInt(sources[i].outputs[i].index),
                // outputIndex
                keys.spend.pub
                // accountKeys.address.spendPublicKey
              );
              const ephemeralSecretKey = CnNativeBride.derive_secret_key(
                derivation,
                // derivation
                parseInt(sources[i].outputs[i].index),
                // outputIndex
                keys.spend.sec
                // accountKeys.spendSecretKey
              );
              const sig = CnNativeBride.generate_signature(
                txPrefixHash,
                // txPrefixHash
                ephemeralPublicKey,
                // ephemeralPublicKey
                ephemeralSecretKey
                // ephemeralSecretKey
              );
              const isValidSignature = CnNativeBride.verify_signature(
                txPrefixHash,
                ephemeralPublicKey,
                sig
              );
              console.log("Signature verification result:", isValidSignature);
              if (!isValidSignature) {
                throw "Signature verification failed";
              }
              tx.signatures.push([sig]);
            }
          }
        } else {
          const txnFee = fee_amount;
          const keyimages = [];
          const inSk = [];
          const inAmounts = [];
          const mixRing = [];
          const indices = [];
          for (i = 0; i < tx.vin.length; i++) {
            keyimages.push(tx.vin[i].k_image);
            inSk.push({
              x: in_contexts[i].sec,
              a: in_contexts[i].mask
            });
            inAmounts.push(tx.vin[i].amount);
            if (in_contexts[i].mask !== CnVars.I) {
              tx.vin[i].amount = "0";
            }
            mixRing[i] = [];
            for (j = 0; j < sources[i].outputs.length; j++) {
              mixRing[i].push({
                dest: sources[i].outputs[j].key,
                mask: sources[i].outputs[j].commit
              });
            }
            indices.push(sources[i].real_out);
          }
          const outAmounts = [];
          for (i = 0; i < tx.vout.length; i++) {
            outAmounts.push(tx.vout[i].amount);
            tx.vout[i].amount = 0;
          }
          logDebugMsg("rc signature----");
          const tx_prefix_hash = CnTransactions2.get_tx_prefix_hash(tx);
          logDebugMsg("rc signature----");
          tx.rct_signatures = CnTransactions2.genRct(
            tx_prefix_hash,
            inSk,
            keyimages,
            /*destinations, */
            inAmounts,
            outAmounts,
            mixRing,
            amountKeys,
            indices,
            txnFee
          );
        }
        logDebugMsg(tx);
        console.log("Transaction construction completed successfully");
        return tx;
      } catch (error) {
        console.error("Error in construct_tx:", error);
        throw error;
      }
    }
    CnTransactions2.construct_tx = construct_tx;
    function create_transaction(pub_keys, sec_keys, dsts, _senderAddress, outputs, mix_outs = [], fake_outputs_count, fee_amount, payment_id, pid_encrypt, realDestViewKey, unlock_time = 0, rct, message, messageTo, ttl, transactionType, term) {
      let i, j;
      if (dsts.length === 0) {
        throw "Destinations empty";
      }
      if (transactionType === "withdraw") {
        fake_outputs_count = 0;
        mix_outs = [];
      } else {
        if (mix_outs.length !== outputs.length && fake_outputs_count !== 0) {
          throw "Wrong number of mix outs provided (" + outputs.length + " outputs, " + mix_outs.length + " mix outs)";
        }
        for (i = 0; i < mix_outs.length; i++) {
          if ((mix_outs[i].outs || []).length < fake_outputs_count) {
            throw "Not enough outputs to mix with";
          }
        }
      }
      const keys = {
        view: {
          pub: pub_keys.view,
          sec: sec_keys.view
        },
        spend: {
          pub: pub_keys.spend,
          sec: sec_keys.spend
        }
      };
      if (!Cn.valid_keys(keys.view.pub, keys.view.sec, keys.spend.pub, keys.spend.sec)) {
        throw "Invalid secret keys!";
      }
      let needed_money = JSBigInt.ZERO;
      for (i = 0; i < dsts.length; ++i) {
        needed_money = needed_money.add(dsts[i].amount);
        if (needed_money.compare(UINT64_MAX) !== -1) {
          throw "Output overflow!";
        }
      }
      let found_money = JSBigInt.ZERO;
      const sources = [];
      logDebugMsg("Selected transfers: ", outputs);
      for (i = 0; i < outputs.length; ++i) {
        found_money = found_money.add(outputs[i].amount);
        if (found_money.compare(UINT64_MAX) !== -1) {
          throw "Input overflow!";
        }
        if (transactionType === "withdraw") {
          const src = {
            outputs: [
              {
                index: outputs[i].index.toString(),
                //.index.toString(),
                key: outputs[i].public_key,
                commit: ""
              }
            ],
            amount: "",
            keys: outputs[i].keys || [],
            real_out_tx_key: outputs[i].tx_pub_key,
            // Set the source transaction key tr.txPubKey
            real_out: 0,
            real_out_in_tx: outputs[i].global_index,
            // Set the output index will be used to generate_signature()
            mask: null,
            key_image: "",
            in_ephemeral: {
              pub: "",
              sec: "",
              mask: ""
            }
          };
          src.amount = new JSBigInt(outputs[i].amount).toString();
          sources.push(src);
        } else {
          const src = {
            outputs: [],
            amount: "",
            real_out_tx_key: "",
            real_out: 0,
            real_out_in_tx: 0,
            mask: null,
            key_image: "",
            in_ephemeral: {
              pub: "",
              sec: "",
              mask: ""
            },
            keys: []
          };
          src.amount = new JSBigInt(outputs[i].amount).toString();
          if (mix_outs.length !== 0) {
            logDebugMsg("mix outs before sort", mix_outs[i].outs);
            mix_outs[i].outs.sort((a, b) => new JSBigInt(a.global_index).compare(b.global_index));
            j = 0;
            logDebugMsg("mix outs sorted", mix_outs[i].outs);
            while (src.outputs.length < fake_outputs_count && j < mix_outs[i].outs.length) {
              const out = mix_outs[i].outs[j];
              logDebugMsg("chekcing mixin");
              logDebugMsg("out: ", out);
              logDebugMsg("output ", i, ": ", outputs[i]);
              if (out.global_index === outputs[i].global_index) {
                logDebugMsg("got mixin the same as output, skipping");
                j++;
                continue;
              }
              const oe = {
                index: out.global_index.toString(),
                key: out.public_key,
                commit: ""
              };
              src.outputs.push(oe);
              j++;
            }
          }
          const real_oe = {
            index: new JSBigInt(outputs[i].global_index || 0).toString(),
            key: outputs[i].public_key,
            commit: ""
          };
          logDebugMsg("OUT FOR REAL:", outputs[i].global_index);
          let real_index = src.outputs.length;
          for (j = 0; j < src.outputs.length; j++) {
            if (new JSBigInt(real_oe.index).compare(src.outputs[j].index) < 0) {
              real_index = j;
              break;
            }
          }
          logDebugMsg("inserting real ouput at index", real_index, real_oe, outputs[i], i);
          src.outputs.splice(real_index, 0, real_oe);
          src.real_out_tx_key = outputs[i].tx_pub_key;
          src.real_out = real_index;
          src.real_out_in_tx = outputs[i].index;
          logDebugMsg("check mask", outputs, rct, i);
          sources.push(src);
        }
      }
      logDebugMsg("found_money: ", found_money);
      logDebugMsg("needed_money: ", needed_money);
      logDebugMsg("sources: ", sources);
      const change = {
        amount: JSBigInt.ZERO
      };
      let cmp = needed_money.compare(found_money);
      if (transactionType === "withdraw") {
        cmp = 0;
      }
      if (cmp < 0) {
        change.amount = found_money.subtract(needed_money);
        if (change.amount.compare(fee_amount) !== 0) {
          throw "early fee calculation != later";
        }
      } else if (cmp > 0) {
        throw "Need more money than found! (have: " + Cn.formatMoney(found_money) + " need: " + Cn.formatMoney(needed_money) + ")";
      }
      return CnTransactions2.construct_tx(
        keys,
        sources,
        dsts,
        _senderAddress,
        fee_amount,
        payment_id,
        pid_encrypt,
        realDestViewKey,
        unlock_time,
        rct,
        message,
        messageTo,
        ttl,
        transactionType,
        term
      );
    }
    CnTransactions2.create_transaction = create_transaction;
  })(CnTransactions || (CnTransactions = {}));

  // lib/wallet-core/Currency.ts
  var KEY_IMAGE_SIZE = 32;
  var OUTPUT_KEY_SIZE = 32;
  var AMOUNT_SIZE = 10;
  var GLOBAL_INDEXES_VECTOR_SIZE_SIZE = 1;
  var GLOBAL_INDEXES_INITIAL_VALUE_SIZE = 4;
  var GLOBAL_INDEXES_DIFFERENCE_SIZE = 4;
  var SIGNATURE_SIZE = 64;
  var EXTRA_TAG_SIZE = 1;
  var INPUT_TAG_SIZE = 1;
  var OUTPUT_TAG_SIZE = 1;
  var PUBLIC_KEY_SIZE = 32;
  var TRANSACTION_VERSION_SIZE = 1;
  var TRANSACTION_UNLOCK_TIME_SIZE = 8;
  var CRYPTONOTE_BLOCK_GRANTED_FULL_REWARD_ZONE = 1e5;
  var Currency = class {
  };
  /**
   @returns true if the amount is dust
   */
  Currency.isDustOutput = (amount) => amount > 0 && amount < Number(config.dustThreshold);
  //Fusion
  Currency.fusionTxMaxSize = CRYPTONOTE_BLOCK_GRANTED_FULL_REWARD_ZONE * 30 / 100;
  Currency.fusionTxMinInputCount = 12;
  // 12 is the default value in C++
  Currency.fusionTxMaxInputCount = 100;
  // 100 is the default value in C++
  Currency.fusionTxMinInOutCountRatio = 4;
  /**
   * Checks if an amount is applicable in a fusion transaction input.
   * @param amount The amount to check.
   * @param threshold The threshold amount for fusion.
   * @param height The current blockchain height.
   * @returns { applicable: boolean; amountPowerOfTen?: number }
   */
  Currency.isAmountApplicableInFusionTransactionInput = (amount, threshold, height) => {
    if (amount >= threshold) {
      return { applicable: false };
    }
    if (height < config.UPGRADE_HEIGHT_V4 && amount < config.dustThreshold) {
      return { applicable: false };
    }
    const PRETTY_AMOUNTS = config.PRETTY_AMOUNTS;
    const idx = PRETTY_AMOUNTS.findIndex((a) => a >= amount);
    if (idx === -1 || PRETTY_AMOUNTS[idx] !== amount) {
      return { applicable: false };
    }
    const amountPowerOfTen = Math.floor(idx / 9);
    return { applicable: true, amountPowerOfTen };
  };
  /**
   * Calculates the approximate maximum number of inputs that can fit in a transaction of given size.
   * @param transactionSize The total size of the transaction in bytes
   * @param outputCount The number of outputs in the transaction
   * @param mixinCount The number of mixins per input
   * @returns The approximate maximum number of inputs that can fit
   */
  Currency.getApproximateMaximumInputCount = (transactionSize, outputCount, mixinCount) => {
    const outputsSize = outputCount * (OUTPUT_TAG_SIZE + OUTPUT_KEY_SIZE + AMOUNT_SIZE);
    const headerSize = TRANSACTION_VERSION_SIZE + TRANSACTION_UNLOCK_TIME_SIZE + EXTRA_TAG_SIZE + PUBLIC_KEY_SIZE;
    const inputSize = INPUT_TAG_SIZE + AMOUNT_SIZE + KEY_IMAGE_SIZE + SIGNATURE_SIZE + GLOBAL_INDEXES_VECTOR_SIZE_SIZE + GLOBAL_INDEXES_INITIAL_VALUE_SIZE + mixinCount * (GLOBAL_INDEXES_DIFFERENCE_SIZE + SIGNATURE_SIZE);
    return Math.floor((transactionSize - headerSize - outputsSize) / inputSize);
  };
  Currency.getApproximateTransactionSize = (inputCount, outputCount, mixinCount) => {
    const outputsSize = outputCount * (OUTPUT_TAG_SIZE + OUTPUT_KEY_SIZE + AMOUNT_SIZE);
    const headerSize = TRANSACTION_VERSION_SIZE + TRANSACTION_UNLOCK_TIME_SIZE + EXTRA_TAG_SIZE + PUBLIC_KEY_SIZE;
    const inputSize = INPUT_TAG_SIZE + AMOUNT_SIZE + KEY_IMAGE_SIZE + SIGNATURE_SIZE + GLOBAL_INDEXES_VECTOR_SIZE_SIZE + GLOBAL_INDEXES_INITIAL_VALUE_SIZE + mixinCount * (GLOBAL_INDEXES_DIFFERENCE_SIZE + SIGNATURE_SIZE);
    return headerSize + inputCount * inputSize + outputsSize;
  };

  // lib/wallet-core/Transaction.ts
  var _TransactionOut = class _TransactionOut {
    constructor() {
      this.amount = 0;
      this.keyImage = "";
      this.outputIdx = 0;
      this.globalIndex = 0;
      this.type = "";
      this.term = 0;
      this.ephemeralPub = "";
      this.pubKey = "";
      this.rtcOutPk = "";
      this.rtcMask = "";
      this.rtcAmount = "";
      this.export = () => {
        const data = {
          keyImage: this.keyImage,
          outputIdx: this.outputIdx,
          globalIndex: this.globalIndex,
          amount: this.amount,
          type: this.type,
          term: this.term
        };
        if (this.rtcOutPk !== "") data.rtcOutPk = this.rtcOutPk;
        if (this.rtcMask !== "") data.rtcMask = this.rtcMask;
        if (this.rtcAmount !== "") data.rtcAmount = this.rtcAmount;
        if (this.ephemeralPub !== "") data.ephemeralPub = this.ephemeralPub;
        if (this.pubKey !== "") data.pubKey = this.pubKey;
        return data;
      };
      this.copy = () => {
        const aCopy = new _TransactionOut();
        aCopy.amount = this.amount;
        aCopy.keyImage = this.keyImage;
        aCopy.outputIdx = this.outputIdx;
        aCopy.globalIndex = this.globalIndex;
        aCopy.type = this.type;
        aCopy.term = this.term;
        aCopy.ephemeralPub = this.ephemeralPub;
        aCopy.pubKey = this.pubKey;
        aCopy.rtcOutPk = this.rtcOutPk;
        aCopy.rtcMask = this.rtcMask;
        aCopy.rtcAmount = this.rtcAmount;
        return aCopy;
      };
    }
  };
  _TransactionOut.fromRaw = (raw) => {
    const nout = new _TransactionOut();
    nout.keyImage = raw.keyImage;
    nout.outputIdx = raw.outputIdx;
    nout.globalIndex = raw.globalIndex;
    nout.amount = raw.amount;
    nout.type = raw.type;
    nout.term = raw.term;
    if (typeof raw.ephemeralPub !== "undefined") nout.ephemeralPub = raw.ephemeralPub;
    if (typeof raw.pubKey !== "undefined") nout.pubKey = raw.pubKey;
    if (typeof raw.rtcOutPk !== "undefined") nout.rtcOutPk = raw.rtcOutPk;
    if (typeof raw.rtcMask !== "undefined") nout.rtcMask = raw.rtcMask;
    if (typeof raw.rtcAmount !== "undefined") nout.rtcAmount = raw.rtcAmount;
    return nout;
  };
  var TransactionOut = _TransactionOut;
  var _TransactionIn = class _TransactionIn {
    constructor() {
      this.outputIndex = -1;
      this.keyImage = "";
      //if < 0, means the in has been seen but not checked (view only wallet)
      this.amount = 0;
      this.type = "";
      this.term = 0;
      this.export = () => {
        return {
          outputIndex: this.outputIndex,
          keyImage: this.keyImage,
          amount: this.amount,
          term: this.term,
          type: this.type
        };
      };
      this.copy = () => {
        const aCopy = new _TransactionIn();
        aCopy.outputIndex = this.outputIndex;
        aCopy.keyImage = this.keyImage;
        aCopy.amount = this.amount;
        aCopy.type = this.type;
        aCopy.term = this.term;
        return aCopy;
      };
    }
  };
  _TransactionIn.fromRaw = (raw) => {
    const nin = new _TransactionIn();
    nin.outputIndex = raw.outputIndex, nin.keyImage = raw.keyImage;
    nin.amount = raw.amount;
    nin.type = raw.type;
    nin.term = raw.term;
    return nin;
  };
  var TransactionIn = _TransactionIn;
  var _Transaction = class _Transaction {
    constructor() {
      this.blockHeight = 0;
      this.txPubKey = "";
      this.hash = "";
      this.outs = [];
      this.ins = [];
      this.timestamp = 0;
      this.paymentId = "";
      this.fees = 0;
      this.fusion = false;
      this.message = "";
      this.messageViewed = false;
      this.ttl = 0;
      // TTL timestamp (absolute UNIX timestamp in seconds)
      this.remoteAddress = "";
      /** Set at sync from TransactionsExplorer.isMinerTx (raw vin.length === 0). */
      this.minerReward = false;
      this.export = () => {
        const data = {
          blockHeight: this.blockHeight,
          txPubKey: this.txPubKey,
          timestamp: this.timestamp,
          hash: this.hash
        };
        if (this.ins.length > 0) {
          const rins = [];
          for (const nin of this.ins) {
            rins.push(nin.export());
          }
          data.ins = rins;
        }
        if (this.outs.length > 0) {
          const routs = [];
          for (const nout of this.outs) {
            routs.push(nout.export());
          }
          data.outs = routs;
        }
        if (this.paymentId !== "") data.paymentId = this.paymentId;
        if (this.message !== "") data.message = this.message;
        if (this.fees !== 0) data.fees = this.fees;
        if (this.fusion) data.fusion = this.fusion;
        if (this.messageViewed) data.messageViewed = this.messageViewed;
        if (this.ttl !== 0) data.ttl = this.ttl;
        if (this.remoteAddress !== "") data.remoteAddress = this.remoteAddress;
        if (this.minerReward) data.minerReward = this.minerReward;
        return data;
      };
      this.getAmount = () => {
        let amount = 0;
        for (const out of this.outs) {
          if (out.type !== "03") {
            amount += out.amount;
          }
        }
        for (const nin of this.ins) {
          if (nin.type !== "03") {
            amount -= nin.amount;
          }
        }
        return amount;
      };
      this.isCoinbase = () => {
        return this.outs.length === 1 && this.outs[0].rtcAmount === "";
      };
      this.isConfirmed = (blockchainHeight) => {
        if (this.blockHeight === 0) {
          return false;
        } else if (this.isCoinbase() && this.blockHeight + config.txCoinbaseMinConfirms < blockchainHeight) {
          return true;
        } else if (!this.isCoinbase() && this.blockHeight + config.txMinConfirms < blockchainHeight) {
          return true;
        }
        return false;
      };
      this.isFullyChecked = () => {
        if (this.getAmount() === 0 || this.getAmount() === -1 * config.minimumFee_V2) {
          if (this.isFusion) {
            return true;
          } else if (this.ttl > 0) {
            return true;
          } else {
            return false;
          }
        } else {
          for (const input of this.ins) {
            if (input.amount < 0) {
              return false;
            }
          }
          return true;
        }
      };
      this.hasMessage = () => {
        const txAmount = this.getAmount();
        return this.message !== "" && txAmount > 0 && txAmount !== 1 * config.remoteNodeFee && txAmount !== 10 * config.remoteNodeFee;
      };
      this.copy = () => {
        const aCopy = new _Transaction();
        aCopy.blockHeight = this.blockHeight;
        aCopy.txPubKey = this.txPubKey;
        aCopy.hash = this.hash;
        aCopy.timestamp = this.timestamp;
        aCopy.paymentId = this.paymentId;
        aCopy.fees = this.fees;
        aCopy.message = this.message;
        aCopy.fusion = this.fusion;
        aCopy.messageViewed = this.messageViewed;
        aCopy.ttl = this.ttl;
        aCopy.remoteAddress = this.remoteAddress;
        aCopy.minerReward = this.minerReward;
        for (const nin of this.ins) {
          aCopy.ins.push(nin.copy());
        }
        for (const nout of this.outs) {
          aCopy.outs.push(nout.copy());
        }
        return aCopy;
      };
    }
    get isDeposit() {
      return this.outs.some((out) => out.type === "03");
    }
    get isWithdrawal() {
      return this.ins.some((input) => input.type === "03");
    }
    get isFusion() {
      const outputsCount = this.outs.length;
      const inputsCount = this.ins.length;
      if (this.outs.some((out) => out.type === "03") || this.ins.some((input) => input.type === "03")) {
        return false;
      }
      return inputsCount > Currency.fusionTxMinInputCount && inputsCount / outputsCount > config.fusionTxMinInOutCountRatio || this.fusion;
    }
  };
  _Transaction.fromRaw = (raw) => {
    const transac = new _Transaction();
    transac.blockHeight = raw.blockHeight;
    transac.txPubKey = raw.txPubKey;
    transac.timestamp = raw.timestamp;
    if (typeof raw.ins !== "undefined") {
      const ins = [];
      for (const rin of raw.ins) {
        ins.push(TransactionIn.fromRaw(rin));
      }
      transac.ins = ins;
    }
    if (typeof raw.outs !== "undefined") {
      const outs = [];
      for (const rout of raw.outs) {
        outs.push(TransactionOut.fromRaw(rout));
      }
      transac.outs = outs;
    }
    if (typeof raw.paymentId !== "undefined") transac.paymentId = raw.paymentId;
    if (typeof raw.fees !== "undefined") transac.fees = raw.fees;
    if (typeof raw.hash !== "undefined") transac.hash = raw.hash;
    if (typeof raw.message !== "undefined") transac.message = raw.message;
    if (typeof raw.fusion !== "undefined") transac.fusion = raw.fusion;
    if (typeof raw.messageViewed !== "undefined") transac.messageViewed = raw.messageViewed;
    if (typeof raw.ttl !== "undefined") transac.ttl = raw.ttl;
    if (typeof raw.remoteAddress !== "undefined") transac.remoteAddress = raw.remoteAddress;
    if (typeof raw.minerReward === "boolean") transac.minerReward = raw.minerReward;
    return transac;
  };
  var Transaction = _Transaction;
  var BaseBanking = class {
    constructor() {
      this.term = 0;
      this.txHash = "";
      this.amount = 0;
      this.interest = 0;
      this.timestamp = 0;
      this.blockHeight = 0;
      this.unlockHeight = 0;
      this.globalOutputIndex = 0;
      this.indexInVout = 0;
      this.txPubKey = "";
    }
    static fromRaw(raw) {
      const deposit = new Deposit();
      deposit.term = raw.term;
      deposit.txHash = raw.txHash;
      deposit.amount = raw.amount;
      deposit.interest = raw.interest;
      deposit.timestamp = raw.timestamp;
      deposit.blockHeight = raw.blockHeight;
      deposit.unlockHeight = raw.unlockHeight || raw.blockHeight + raw.term;
      deposit.globalOutputIndex = raw.globalOutputIndex;
      deposit.indexInVout = raw.indexInVout;
      deposit.txPubKey = raw.txPubKey;
      return deposit;
    }
    export() {
      return {
        term: this.term,
        txHash: this.txHash,
        amount: this.amount,
        interest: this.interest,
        timestamp: this.timestamp,
        blockHeight: this.blockHeight,
        unlockHeight: this.unlockHeight,
        globalOutputIndex: this.globalOutputIndex,
        indexInVout: this.indexInVout,
        txPubKey: this.txPubKey
      };
    }
    copy() {
      const aCopy = new Deposit();
      aCopy.term = this.term;
      aCopy.txHash = this.txHash;
      aCopy.amount = this.amount;
      aCopy.interest = this.interest;
      aCopy.timestamp = this.timestamp;
      aCopy.blockHeight = this.blockHeight;
      aCopy.unlockHeight = this.unlockHeight;
      aCopy.globalOutputIndex = this.globalOutputIndex;
      aCopy.indexInVout = this.indexInVout;
      aCopy.txPubKey = this.txPubKey;
      return aCopy;
    }
  };
  var Deposit = class _Deposit extends BaseBanking {
    constructor() {
      super(...arguments);
      this.spentTx = "";
      this.keys = [];
      // Array of public keys for multisignature deposit
      this.withdrawPending = false;
      this.copy = () => {
        const aCopy = super.copy();
        aCopy.spentTx = this.spentTx;
        aCopy.withdrawPending = this.withdrawPending;
        aCopy.keys = [...this.keys];
        return aCopy;
      };
    }
    static fromRaw(raw) {
      const deposit = new _Deposit();
      deposit.term = raw.term;
      deposit.txHash = raw.txHash;
      deposit.amount = raw.amount;
      deposit.interest = raw.interest;
      deposit.spentTx = raw.spentTx;
      deposit.timestamp = raw.timestamp;
      deposit.blockHeight = raw.blockHeight;
      deposit.globalOutputIndex = raw.globalOutputIndex;
      deposit.indexInVout = raw.indexInVout;
      deposit.txPubKey = raw.txPubKey;
      deposit.unlockHeight = raw.unlockHeight || raw.blockHeight + raw.term;
      deposit.keys = raw.keys || [];
      deposit.withdrawPending = raw.withdrawPending;
      return deposit;
    }
    export() {
      return Object.assign(super.export(), {
        spentTx: this.spentTx,
        withdrawPending: this.withdrawPending,
        keys: this.keys
      });
    }
    // Get total amount (principal + interest)
    getTotalAmount() {
      return this.amount + this.interest;
    }
    // Check if deposit is unlocked at current height
    isUnlocked(currentHeight) {
      return currentHeight >= this.unlockHeight;
    }
    // Check if deposit has been spent
    isSpent() {
      return !!this.spentTx;
    }
    // Get deposit status
    getStatus(currentHeight) {
      if (this.isSpent()) {
        return "Spent";
      } else if (this.isUnlocked(currentHeight)) {
        return "Unlocked";
      } else {
        return "Locked";
      }
    }
  };
  var Withdrawal = class extends BaseBanking {
  };
  var _TransactionData = class _TransactionData {
    constructor() {
      this.transaction = null;
      this.withdrawals = [];
      this.deposits = [];
      this.export = () => {
        const txData = {};
        const deposits = [];
        const withdrawals = [];
        if (this.transaction) {
          txData.transaction = this.transaction.export();
        }
        if (this.deposits.length > 0) {
          for (const deposit of this.deposits) {
            deposits.push(deposit.export());
          }
        }
        if (this.withdrawals.length > 0) {
          for (const withdrawal of this.withdrawals) {
            withdrawals.push(withdrawal.export());
          }
        }
        txData.deposits = deposits;
        txData.withdrawals = withdrawals;
        return txData;
      };
      this.copy = () => {
        const aCopy = new _TransactionData();
        aCopy.transaction = this.transaction ? this.transaction.copy() : null;
        for (const deposit of this.deposits) {
          aCopy.deposits.push(deposit.copy());
        }
        for (const withdrawal of this.withdrawals) {
          aCopy.withdrawals.push(withdrawal.copy());
        }
        return aCopy;
      };
    }
  };
  _TransactionData.fromRaw = (raw) => {
    const txData = new _TransactionData();
    txData.transaction = Transaction.fromRaw(raw.transaction);
    if (raw.withdrawals) {
      for (const withdrawal of raw.withdrawals) {
        txData.withdrawals.push(Deposit.fromRaw(withdrawal));
      }
    }
    if (raw.deposits) {
      for (const deposit of raw.deposits) {
        txData.deposits.push(Deposit.fromRaw(deposit));
      }
    }
    return txData;
  };
  var TransactionData = _TransactionData;

  // lib/wallet-core/Interest.ts
  var _InterestCalculator = class _InterestCalculator {
    /**
     * Calculates interest for a deposit based on amount, term, and lock height
     * @param amount - Amount of the deposit in atomic units
     * @param term - Term of the deposit in blocks
     * @param lockHeight - Block height when the deposit was made
     * @returns The calculated interest amount in atomic units
     */
    static calculateInterest(amount, term, lockHeight) {
      if (lockHeight === _InterestCalculator.BLOCK_WITH_MISSING_INTEREST) {
        lockHeight = lockHeight + term;
      }
      if (term % _InterestCalculator.DEPOSIT_MIN_TERM_V3 === 0 && lockHeight > (config.depositHeightV3 || _InterestCalculator.DEPOSIT_HEIGHT_V3)) {
        return _InterestCalculator.calculateInterestV3(amount, term);
      }
      if (term % 64800 === 0 || term % _InterestCalculator.DEPOSIT_MIN_TERM === 0) {
        return _InterestCalculator.calculateInterestV2(amount, term);
      }
      logDebugMsg("Warning: Using legacy V1 interest calculation");
      const m_depositMaxTerm = _InterestCalculator.DEPOSIT_MAX_TERM;
      const a = term * _InterestCalculator.DEPOSIT_MAX_TOTAL_RATE - _InterestCalculator.DEPOSIT_MIN_TOTAL_RATE_FACTOR;
      const product = BigInt(Math.trunc(amount)) * BigInt(a);
      const base = Number(product / BigInt(100 * m_depositMaxTerm));
      return lockHeight <= _InterestCalculator.END_MULTIPLIER_BLOCK ? base * _InterestCalculator.MULTIPLIER_FACTOR : base;
    }
    /**
     * Calculates interest for V3 deposits (monthly terms)
     * @param amount - Amount of the deposit in atomic units
     * @param term - Term of the deposit in blocks
     * @returns The calculated interest amount in atomic units
     */
    static calculateInterestV3(amount, term) {
      const m_coin = Math.pow(10, config.coinUnitPlaces);
      const amount4Humans = amount / m_coin;
      let baseInterest = config.depositRateV3[0] || 0.029;
      if (amount4Humans >= 2e4) {
        baseInterest = config.depositRateV3[2] || 0.049;
      } else if (amount4Humans >= 1e4) {
        baseInterest = config.depositRateV3[1] || 0.039;
      }
      let months = term / _InterestCalculator.DEPOSIT_MIN_TERM_V3;
      if (months > 12) {
        months = 12;
      }
      const ear = baseInterest + (months - 1) * 1e-3;
      const eir = ear / 12 * months;
      const interest = amount * eir;
      return Math.floor(interest);
    }
    /**
     * Calculates interest for V2 deposits (investment or weekly terms)
     * @param amount - Amount of the deposit in atomic units
     * @param term - Term of the deposit in blocks
     * @returns The calculated interest amount in atomic units
     */
    static calculateInterestV2(amount, term) {
      const m_coin = Math.pow(10, config.coinUnitPlaces);
      if (term % 64800 === 0) {
        const amount4Humans = amount / m_coin;
        let qTier = 1;
        if (amount4Humans > 11e4 && amount4Humans < 18e4) qTier = 1.01;
        if (amount4Humans >= 18e4 && amount4Humans < 26e4) qTier = 1.02;
        if (amount4Humans >= 26e4 && amount4Humans < 35e4) qTier = 1.03;
        if (amount4Humans >= 35e4 && amount4Humans < 45e4) qTier = 1.04;
        if (amount4Humans >= 45e4 && amount4Humans < 56e4) qTier = 1.05;
        if (amount4Humans >= 56e4 && amount4Humans < 68e4) qTier = 1.06;
        if (amount4Humans >= 68e4 && amount4Humans < 81e4) qTier = 1.07;
        if (amount4Humans >= 81e4 && amount4Humans < 95e4) qTier = 1.08;
        if (amount4Humans >= 95e4 && amount4Humans < 11e5) qTier = 1.09;
        if (amount4Humans >= 11e5 && amount4Humans < 126e4) qTier = 1.1;
        if (amount4Humans >= 126e4 && amount4Humans < 143e4) qTier = 1.11;
        if (amount4Humans >= 143e4 && amount4Humans < 161e4) qTier = 1.12;
        if (amount4Humans >= 161e4 && amount4Humans < 18e5) qTier = 1.13;
        if (amount4Humans >= 18e5 && amount4Humans < 2e6) qTier = 1.14;
        if (amount4Humans > 2e6) qTier = 1.15;
        const mq = config.investmentMq || 1.4473;
        const termQuarters = term / 64800;
        const m8 = 100 * Math.pow(1 + mq / 100, termQuarters) - 100;
        const m5 = termQuarters * 0.5;
        const m7 = m8 * (1 + m5 / 100);
        const rate = m7 * qTier;
        const interest = amount * (rate / 100);
        return Math.floor(interest);
      }
      if (term % _InterestCalculator.DEPOSIT_MIN_TERM === 0) {
        const weeks = term / _InterestCalculator.DEPOSIT_MIN_TERM;
        const baseInterest = config.weeklyBaseInterest || 0.0696;
        const interestPerWeek = config.weeklyInterestIncrement || 2e-4;
        const interestRate = baseInterest + weeks * interestPerWeek;
        const interest = amount * (weeks * interestRate / 100);
        return Math.floor(interest);
      }
      return 0;
    }
  };
  // Constants from C++ implementation
  _InterestCalculator.DEPOSIT_MIN_TERM = 5040;
  // One week
  // conceal-core uses DEPOSIT_MAX_TERM (one year) as the legacy-interest divisor,
  // NOT the five-year DEPOSIT_MAX_TERM_V1 (which only bounds the term in
  // validation). See conceal-core src/CryptoNoteConfig.h + Currency.cpp:1371.
  _InterestCalculator.DEPOSIT_MAX_TERM = 1 * 12 * 21900;
  // 262800 — one year
  _InterestCalculator.DEPOSIT_MIN_TERM_V3 = 21900;
  // One month
  _InterestCalculator.DEPOSIT_HEIGHT_V3 = 413400;
  // Height when V3 deposit rates were activated
  _InterestCalculator.DEPOSIT_MIN_TOTAL_RATE_FACTOR = 0;
  // Constant rate
  _InterestCalculator.DEPOSIT_MAX_TOTAL_RATE = 4;
  // Legacy deposits
  _InterestCalculator.BLOCK_WITH_MISSING_INTEREST = 425799;
  // Block with special handling
  // Early-deposit multiplier (conceal-core src/CryptoNoteConfig.h:85-86): deposits
  // locked on/before block 12750 earned 100× the base legacy rate.
  _InterestCalculator.END_MULTIPLIER_BLOCK = 12750;
  _InterestCalculator.MULTIPLIER_FACTOR = 100;
  var InterestCalculator = _InterestCalculator;

  // lib/wallet-core/Varint.ts
  var MSB = 128;
  var REST = 127;
  var MSBALL = ~REST;
  var INT = Math.pow(2, 31);
  var TWO_POWER_SEVEN = Math.pow(2, 7);
  var decode = ((buf, offset = 0) => {
    let res = 0, shift = 1, counter = offset, b;
    const l = Math.pow(TWO_POWER_SEVEN, buf.length - offset < 8 ? (buf.length - offset) * 7 : 49);
    do {
      if (shift > l) {
        decode.bytes = 0;
        throw new RangeError("Could not decode varint");
      }
      b = buf[counter++];
      res += (b & REST) * shift;
      shift = shift * TWO_POWER_SEVEN;
    } while (b >= MSB);
    decode.bytes = counter - offset;
    return res;
  });

  // lib/wallet-core/TransactionsExplorer.ts
  var TX_EXTRA_TAG_PADDING = 0;
  var TX_EXTRA_TAG_PUBKEY = 1;
  var TX_EXTRA_NONCE = 2;
  var TX_EXTRA_MERGE_MINING_TAG = 3;
  var TX_EXTRA_MESSAGE_TAG = 4;
  var TX_EXTRA_MYSTERIOUS_MINERGATE_TAG = 222;
  var TX_EXTRA_NONCE_PAYMENT_ID = 0;
  var TX_EXTRA_NONCE_ENCRYPTED_PAYMENT_ID = 1;
  var TX_EXTRA_TTL = 5;
  var TX_EXTRA_MESSAGE_CHECKSUM_SIZE = 4;
  var TransactionsExplorer = class _TransactionsExplorer {
    static parseExtra(oExtra) {
      let extra = oExtra.slice();
      const extras = [];
      let hasFoundPubKey = false;
      while (extra.length > 0) {
        try {
          let extraSize = 0;
          let startOffset = 0;
          if (extra[0] === TX_EXTRA_NONCE || extra[0] === TX_EXTRA_MERGE_MINING_TAG || extra[0] === TX_EXTRA_MYSTERIOUS_MINERGATE_TAG) {
            extraSize = extra[1];
            startOffset = 2;
          } else if (extra[0] === TX_EXTRA_TAG_PUBKEY) {
            extraSize = 32;
            startOffset = 1;
            hasFoundPubKey = true;
          } else if (extra[0] === TX_EXTRA_MESSAGE_TAG) {
            extraSize = extra[1];
            startOffset = 2;
          } else if (extra[0] === TX_EXTRA_TTL) {
            extraSize = extra[1];
            startOffset = 2;
          } else if (extra[0] === TX_EXTRA_TAG_PADDING) {
          }
          if (extraSize === 0) {
            if (!hasFoundPubKey) {
              throw "Invalid extra size " + extra[0];
            }
            break;
          }
          if (startOffset > 0 && extraSize > 0) {
            const data = extra.slice(startOffset, startOffset + extraSize);
            extras.push({
              type: extra[0],
              data
            });
            extra = extra.slice(startOffset + extraSize);
          } else if (!extraSize) {
            logDebugMsg("Corrupt extra skipping it...");
            break;
          }
        } catch (err) {
          logDebugMsg("Error in parsing extra", err);
          break;
        }
      }
      return extras;
    }
    static isMinerTx(rawTransaction) {
      if (!Array.isArray(rawTransaction.vout) || rawTransaction.vout.length === 0) {
        console.error("Weird tx !", rawTransaction);
        return false;
      }
      const coinbaseVin = rawTransaction.vin.length === 0 || rawTransaction.vin.length === 1 && rawTransaction.vin[0]?.type === "ff";
      if (!coinbaseVin) {
        return false;
      }
      try {
        return rawTransaction.vout[0].amount !== 0;
      } catch {
        return false;
      }
    }
    static toTxScanInput(rawTransaction) {
      const vouts = [];
      for (let iOut = 0; iOut < rawTransaction.vout.length; iOut++) {
        const out = rawTransaction.vout[iOut];
        const txout_k = out.target.data;
        const vout = {
          type: out.target.type
        };
        if (out.target.type === "02" && typeof txout_k.key !== "undefined") {
          vout.key = txout_k.key;
        } else if (out.target.type === "03" && typeof txout_k.keys !== "undefined") {
          vout.keys = txout_k.keys;
        }
        vouts.push(vout);
      }
      const vins = [];
      for (let iIn = 0; iIn < rawTransaction.vin.length; ++iIn) {
        const vin = rawTransaction.vin[iIn];
        if (vin.value) {
          vins.push({
            k_image: vin.value.k_image,
            key_offsets: vin.value.key_offsets
          });
        }
      }
      return {
        extraHex: rawTransaction.extra,
        vouts,
        vins
      };
    }
    /** UTXO-backed scan context (matches legacy key-image / global-index checks). */
    static toTxScanContext(wallet) {
      const hasSpend = wallet.keys.priv.spend !== null && wallet.keys.priv.spend !== "";
      const ctx = {
        viewSecretHex: wallet.keys.priv.view,
        spendPublicHex: wallet.keys.pub.spend
      };
      if (hasSpend) {
        ctx.spendSecretHex = wallet.keys.priv.spend;
        const ownedKeyImages = [];
        for (const ut of wallet.getAllOuts()) {
          if (ut.keyImage) {
            ownedKeyImages.push(ut.keyImage);
          }
        }
        ctx.ownedKeyImages = ownedKeyImages;
      }
      return ctx;
    }
    static ownsTx(rawTransaction, wallet) {
      try {
        const owned = concealjs.transactions.ownsTx(
          _TransactionsExplorer.toTxScanInput(rawTransaction),
          _TransactionsExplorer.toTxScanContext(wallet)
        );
        if (owned) {
          logDebugMsg("Found our tx...");
        }
        return owned;
      } catch (e) {
        console.error("Error when scanning transaction on block", rawTransaction.height, e);
        return false;
      }
    }
    /**
     * Screen a sync shard via `concealjs.transactions.ownsTxBatch` (one `scan_receive_outputs_batch`
     * WASM call per shard on lib ≥0.2.2, then JS spend checks). Shard size drives FFI savings.
     */
    static screenShardForOwnedHashes(rawTransactions, wallet, readMinersTx) {
      const candidates = [];
      for (let i = 0; i < rawTransactions.length; i++) {
        const raw = rawTransactions[i];
        if (!raw?.height) {
          continue;
        }
        if (!readMinersTx && _TransactionsExplorer.isMinerTx(raw)) {
          continue;
        }
        candidates.push(raw);
      }
      if (candidates.length === 0) {
        return [];
      }
      const ctx = _TransactionsExplorer.toTxScanContext(wallet);
      const inputs = candidates.map((raw) => _TransactionsExplorer.toTxScanInput(raw));
      let ownedFlags;
      try {
        ownedFlags = concealjs.transactions.ownsTxBatch(inputs, ctx);
      } catch (e) {
        console.error("ownsTxBatch failed, falling back to per-tx screen:", e);
        ownedFlags = candidates.map((raw) => _TransactionsExplorer.ownsTx(raw, wallet));
      }
      const hashes = [];
      for (let i = 0; i < candidates.length; i++) {
        const hash = candidates[i].hash;
        if (ownedFlags[i] && hash) {
          hashes.push(hash);
        }
      }
      return hashes;
    }
    static decryptMessage(index, txPubKey, recepientSecretSpendKey, rawMessage) {
      let decryptedMessage = "";
      let mlen = rawMessage.length / 2;
      if (mlen < TX_EXTRA_MESSAGE_CHECKSUM_SIZE) {
        return null;
      }
      let derivation;
      try {
        derivation = concealjs.crypto.generate_key_derivation(txPubKey, recepientSecretSpendKey);
      } catch (e) {
        console.error("UNABLE TO CREATE DERIVATION", e);
        return null;
      }
      const magick1 = "80";
      const magick2 = "00";
      const keyData = derivation + magick1 + magick2;
      const hash = concealjs.cnutils.cn_fast_hash(keyData);
      const hashBuf = concealjs.cnutils.hextobin(hash);
      const nonceBuf = new Uint8Array(12);
      for (let i = 0; i < 12; i++) {
        nonceBuf.set([index / 256 ** i], 11 - i);
      }
      const rawMessArr = concealjs.cnutils.hextobin(rawMessage);
      const cha = new JSChaCha8(hashBuf, nonceBuf);
      const _buf = cha.decrypt(rawMessArr);
      decryptedMessage = new TextDecoder().decode(_buf);
      mlen -= TX_EXTRA_MESSAGE_CHECKSUM_SIZE;
      for (let i = 0; i < TX_EXTRA_MESSAGE_CHECKSUM_SIZE; i++) {
        if (_buf[mlen + i] !== 0) {
          return null;
        }
      }
      return decryptedMessage.slice(0, -TX_EXTRA_MESSAGE_CHECKSUM_SIZE);
    }
    static parse(rawTransaction, wallet) {
      let transactionData = null;
      let transaction = null;
      const withdrawals = [];
      const deposits = [];
      let tx_pub_key = "";
      let paymentId = null;
      let rawMessage = "";
      let ttl = 0;
      let txExtras = [];
      try {
        const hexExtra = [];
        const uint8Array = concealjs.cnutils.hextobin(rawTransaction.extra);
        for (let i = 0; i < uint8Array.byteLength; i++) {
          hexExtra[i] = uint8Array[i];
        }
        txExtras = _TransactionsExplorer.parseExtra(hexExtra);
      } catch (e) {
        console.error("Error when scanning transaction on block", rawTransaction.height, e);
        return null;
      }
      for (const extra of txExtras) {
        if (extra.type === TX_EXTRA_TAG_PUBKEY) {
          for (let i = 0; i < 32; ++i) {
            tx_pub_key += String.fromCharCode(extra.data[i]);
          }
          break;
        }
      }
      if (tx_pub_key === "") {
        console.error(`tx_pub_key === null`, rawTransaction.height, rawTransaction.hash);
        return null;
      }
      tx_pub_key = concealjs.cnutils.bintohex(tx_pub_key);
      let encryptedPaymentId = null;
      let extraIndex = 0;
      for (const extra of txExtras) {
        if (extra.type === TX_EXTRA_NONCE) {
          if (extra.data[0] === TX_EXTRA_NONCE_PAYMENT_ID) {
            paymentId = "";
            for (let i = 1; i < extra.data.length; ++i) {
              paymentId += String.fromCharCode(extra.data[i]);
            }
            paymentId = concealjs.cnutils.bintohex(paymentId);
          } else if (extra.data[0] === TX_EXTRA_NONCE_ENCRYPTED_PAYMENT_ID) {
            encryptedPaymentId = "";
            for (let i = 1; i < extra.data.length; ++i) {
              encryptedPaymentId += String.fromCharCode(extra.data[i]);
            }
            encryptedPaymentId = concealjs.cnutils.bintohex(encryptedPaymentId);
          }
        } else if (extra.type === TX_EXTRA_MESSAGE_TAG) {
          for (let i = 0; i < extra.data.length; ++i) {
            rawMessage += String.fromCharCode(extra.data[i]);
          }
          rawMessage = concealjs.cnutils.bintohex(rawMessage);
        } else if (extra.type === TX_EXTRA_TTL) {
          let rawTTL = "";
          for (let i = 0; i < extra.data.length; ++i) {
            rawTTL += String.fromCharCode(extra.data[i]);
          }
          const ttlStr = concealjs.cnutils.bintohex(rawTTL);
          const uint8Array = concealjs.cnutils.hextobin(ttlStr);
          ttl = decode(uint8Array);
        }
        extraIndex++;
      }
      let derivation = null;
      try {
        derivation = concealjs.crypto.generate_key_derivation(tx_pub_key, wallet.keys.priv.view);
      } catch (e) {
        console.error("UNABLE TO CREATE DERIVATION", e);
        return null;
      }
      const outs = [];
      const ins = [];
      for (let iOut = 0; iOut < rawTransaction.vout.length; iOut++) {
        const out = rawTransaction.vout[iOut];
        const txout_k = out.target.data;
        let amount = 0;
        try {
          amount = out.amount;
        } catch (e) {
          console.error(e);
          continue;
        }
        const output_idx_in_tx = iOut;
        const generated_tx_pubkey = concealjs.crypto.derive_public_key(
          derivation,
          output_idx_in_tx,
          wallet.keys.pub.spend
        );
        let mine_output = false;
        if (out.target.type === "02" && typeof txout_k.key !== "undefined") {
          mine_output = txout_k.key === generated_tx_pubkey;
        } else if (out.target.type === "03" && typeof txout_k.keys !== "undefined") {
          for (let iKey = 0; iKey < txout_k.keys.length; iKey++) {
            if (txout_k.keys[iKey] === generated_tx_pubkey) {
              mine_output = true;
            }
          }
        }
        if (mine_output) {
          const transactionOut = new TransactionOut();
          if (typeof rawTransaction.global_index_start !== "undefined")
            transactionOut.globalIndex = rawTransaction.output_indexes[output_idx_in_tx];
          else transactionOut.globalIndex = output_idx_in_tx;
          transactionOut.amount = amount;
          if (out.target.type === "02" && typeof txout_k.key !== "undefined") {
            transactionOut.pubKey = txout_k.key;
            transactionOut.type = "02";
          } else if (out.target.type === "03" && typeof txout_k.keys !== "undefined") {
            transactionOut.pubKey = generated_tx_pubkey;
            transactionOut.type = "03";
            if (out.target.data?.term) {
              const deposit = new Deposit();
              if (typeof rawTransaction.height !== "undefined")
                deposit.blockHeight = rawTransaction.height;
              if (typeof rawTransaction.hash !== "undefined") deposit.txHash = rawTransaction.hash;
              if (typeof rawTransaction.ts !== "undefined") deposit.timestamp = rawTransaction.ts;
              deposit.amount = transactionOut.amount;
              deposit.term = out.target.data.term;
              if (rawTransaction.output_indexes && typeof rawTransaction.output_indexes[iOut] !== "undefined") {
                deposit.globalOutputIndex = rawTransaction.output_indexes[iOut];
              } else {
                deposit.globalOutputIndex = 0;
              }
              deposit.indexInVout = iOut;
              if (out.target.data.keys && Array.isArray(out.target.data.keys)) {
                deposit.keys = out.target.data.keys;
              }
              deposit.txPubKey = tx_pub_key;
              deposit.interest = InterestCalculator.calculateInterest(
                deposit.amount,
                deposit.term,
                deposit.blockHeight
              );
              deposits.push(deposit);
            }
          }
          transactionOut.outputIdx = output_idx_in_tx;
          if (wallet.keys.priv.spend !== null && wallet.keys.priv.spend !== "") {
            const m_key_image = CnTransactions.generate_key_image_helper(
              {
                view_secret_key: wallet.keys.priv.view,
                spend_secret_key: wallet.keys.priv.spend,
                public_spend_key: wallet.keys.pub.spend
              },
              tx_pub_key,
              output_idx_in_tx,
              derivation
            );
            transactionOut.keyImage = m_key_image.key_image;
            transactionOut.ephemeralPub = m_key_image.ephemeral_pub;
          }
          outs.push(transactionOut);
        }
      }
      if (wallet.keys.priv.spend !== null && wallet.keys.priv.spend !== "") {
        const keyImages = wallet.getTransactionKeyImages();
        for (let iIn = 0; iIn < rawTransaction.vin.length; ++iIn) {
          const vin = rawTransaction.vin[iIn];
          let wasAdded = false;
          if (vin.value?.k_image && keyImages.indexOf(vin.value.k_image) !== -1) {
            const walletOuts = wallet.getAllOuts();
            for (const ut of walletOuts) {
              if (wasAdded) {
                console.log(ut.keyImage, "=", vin.value.k_image);
              }
              if (ut.keyImage === vin.value.k_image) {
                const transactionIn = new TransactionIn();
                transactionIn.amount = ut.amount;
                transactionIn.keyImage = ut.keyImage;
                if (vin.type === "03") {
                  if (vin.value?.term) {
                    const withdrawal = new Deposit();
                    withdrawal.globalOutputIndex = vin.value?.outputIndex ? vin.value.outputIndex : 0;
                    if (typeof rawTransaction.height !== "undefined")
                      withdrawal.blockHeight = rawTransaction.height;
                    if (typeof rawTransaction.hash !== "undefined")
                      withdrawal.txHash = rawTransaction.hash;
                    if (typeof rawTransaction.ts !== "undefined")
                      withdrawal.timestamp = rawTransaction.ts;
                    withdrawal.term = vin.value?.term ? vin.value.term : 0;
                    withdrawal.amount = transactionIn.amount;
                    withdrawals.push(withdrawal);
                    wasAdded = true;
                  }
                }
                ins.push(transactionIn);
                break;
              }
            }
          }
          if (!wasAdded && vin.type === "03") {
            const transactionIn = new TransactionIn();
            transactionIn.type = "03";
            transactionIn.term = vin.value?.term ? vin.value.term : 0;
            if (vin.value?.amount) {
              transactionIn.amount = parseInt(vin.value.amount);
            }
            ins.push(transactionIn);
            const withdrawal = new Deposit();
            if (typeof rawTransaction.ts !== "undefined") withdrawal.timestamp = rawTransaction.ts;
            if (typeof rawTransaction.hash !== "undefined") withdrawal.txHash = rawTransaction.hash;
            if (typeof rawTransaction.height !== "undefined")
              withdrawal.blockHeight = rawTransaction.height;
            if (vin.value?.amount) withdrawal.amount = parseInt(vin.value.amount);
            withdrawal.globalOutputIndex = vin.value?.outputIndex ? vin.value.outputIndex : 0;
            withdrawal.term = vin.value?.term ? vin.value.term : 0;
            withdrawals.push(withdrawal);
            wasAdded = true;
          }
        }
      } else if (outs.length > 0) {
        const ownedDepositIndexes = /* @__PURE__ */ new Set();
        for (const deposit of wallet.deposits) {
          if (deposit.globalOutputIndex > 0) {
            ownedDepositIndexes.add(deposit.globalOutputIndex);
          }
        }
        if (ownedDepositIndexes.size > 0) {
          for (let iIn = 0; iIn < rawTransaction.vin.length; ++iIn) {
            const vin = rawTransaction.vin[iIn];
            if (!vin.value || vin.type !== "03") {
              continue;
            }
            const outputIndex = vin.value.outputIndex;
            if (typeof outputIndex !== "number" || !ownedDepositIndexes.has(outputIndex)) {
              continue;
            }
            const transactionIn = new TransactionIn();
            transactionIn.type = "03";
            transactionIn.term = vin.value?.term ? vin.value.term : 0;
            if (vin.value?.amount) {
              transactionIn.amount = parseInt(vin.value.amount, 10);
            }
            ins.push(transactionIn);
            const withdrawal = new Deposit();
            if (typeof rawTransaction.ts !== "undefined") withdrawal.timestamp = rawTransaction.ts;
            if (typeof rawTransaction.hash !== "undefined") withdrawal.txHash = rawTransaction.hash;
            if (typeof rawTransaction.height !== "undefined")
              withdrawal.blockHeight = rawTransaction.height;
            if (vin.value?.amount) withdrawal.amount = parseInt(vin.value.amount, 10);
            withdrawal.globalOutputIndex = outputIndex;
            withdrawal.term = vin.value?.term ? vin.value.term : 0;
            withdrawals.push(withdrawal);
          }
        }
      }
      if (outs.length > 0 || ins.length) {
        transactionData = new TransactionData();
        transaction = new Transaction();
        if (typeof rawTransaction.height !== "undefined")
          transaction.blockHeight = rawTransaction.height;
        if (typeof rawTransaction.ts !== "undefined") transaction.timestamp = rawTransaction.ts;
        if (typeof rawTransaction.hash !== "undefined") transaction.hash = rawTransaction.hash;
        transaction.txPubKey = tx_pub_key;
        if (paymentId !== null) transaction.paymentId = paymentId;
        if (encryptedPaymentId !== null) {
          transaction.paymentId = Cn.decrypt_payment_id(
            encryptedPaymentId,
            tx_pub_key,
            wallet.keys.priv.view
          );
        }
        if (rawTransaction.vin.length === 0 || rawTransaction.vin[0]?.type === "ff") {
          transaction.fees = 0;
        } else {
          transaction.fees = rawTransaction.fee;
        }
        transaction.fusion = rawTransaction.vin.length > Currency.fusionTxMinInputCount && rawTransaction.vout.length <= config.maxFusionOutputs && rawTransaction.vin.length / rawTransaction.vout.length > config.fusionTxMinInOutCountRatio && rawTransaction.vin.some((vin) => vin.type !== "03") && rawTransaction.vout.some((vout) => vout.target.type !== "03") && (transaction.fees === 0 || transaction.fees === parseInt(config.minimumFee_V2));
        transaction.minerReward = _TransactionsExplorer.isMinerTx(rawTransaction);
        transaction.outs = outs;
        transaction.ins = ins;
        transactionData.transaction = transaction;
        transactionData.withdrawals = withdrawals;
        transactionData.deposits = deposits;
        if (rawMessage !== "" && wallet.keys.priv.spend !== null && wallet.keys.priv.spend !== "") {
          try {
            const message = _TransactionsExplorer.decryptMessage(
              extraIndex,
              tx_pub_key,
              wallet.keys.priv.spend,
              rawMessage
            );
            transaction.message = message;
          } catch (e) {
            console.error("ERROR IN DECRYPTING MESSAGE: ", e);
          }
        }
      }
      if (transaction && typeof ttl !== "undefined") {
        transaction.ttl = ttl;
      }
      return transactionData;
    }
    static formatWalletOutsForTx(wallet, blockchainHeight) {
      const allOuts = [];
      let unspentOuts = [];
      for (const tr of wallet.getAll()) {
        if (!tr.isConfirmed(blockchainHeight - 2)) {
          continue;
        }
        for (const out of tr.outs) {
          if (out.type === "03") {
            continue;
          }
          allOuts.push({
            keyImage: out.keyImage,
            amount: out.amount,
            public_key: out.pubKey,
            index: out.outputIdx,
            global_index: out.globalIndex,
            tx_pub_key: tr.txPubKey,
            keys: []
          });
        }
      }
      const spentKeyImages = /* @__PURE__ */ new Set();
      for (const tr of wallet.getAll().concat(wallet.txsMem)) {
        for (const i of tr.ins) {
          if (i.keyImage) {
            spentKeyImages.add(i.keyImage);
          }
        }
      }
      unspentOuts = allOuts.filter((out) => !spentKeyImages.has(out.keyImage));
      return unspentOuts;
    }
    static createRawTx(dsts, wallet, rct, usingOuts, pid_encrypt, mix_outs = [], mixin, neededFee, payment_id, message, ttl, transactionType, term) {
      return new Promise((resolve, reject) => {
        let signed;
        try {
          let realDestViewKey;
          if (pid_encrypt) {
            realDestViewKey = Cn.decode_address(dsts[0].address).view;
          }
          let messageTo;
          if (message) {
            messageTo = dsts[0].address;
          }
          let splittedDsts;
          if (transactionType === "deposit") {
            const depositDst = dsts[0];
            const otherDsts = dsts.slice(1);
            const decomposedOtherDsts = CnTransactions.decompose_tx_destinations(otherDsts, rct);
            splittedDsts = [depositDst].concat(decomposedOtherDsts);
          } else {
            splittedDsts = CnTransactions.decompose_tx_destinations(dsts, rct);
          }
          signed = CnTransactions.create_transaction(
            {
              spend: wallet.keys.pub.spend,
              view: wallet.keys.pub.view
            },
            {
              spend: wallet.keys.priv.spend,
              view: wallet.keys.priv.view
            },
            splittedDsts,
            wallet.getPublicAddress(),
            usingOuts,
            mix_outs,
            mixin,
            neededFee,
            payment_id,
            pid_encrypt,
            realDestViewKey,
            0,
            rct,
            message,
            messageTo,
            ttl,
            transactionType,
            term
          );
          logDebugMsg("signed tx: ", signed);
          const raw_tx_and_hash = CnTransactions.serialize_tx_with_hash(signed);
          resolve({ raw: raw_tx_and_hash, signed });
        } catch (e) {
          reject("Failed to create transaction: " + e);
        }
      });
    }
    static createTx(userDestinations, userPaymentId = "", wallet, blockchainHeight, obtainMixOutsCallback, confirmCallback, mixin = config.defaultMixin, message = "", ttl = 0, transactionType = "regular", term = 0) {
      return new Promise((resolve, reject) => {
        const neededFee = new JSBigInt(window.config.coinFee);
        let pid_encrypt = false;
        let totalAmountWithoutFee = new JSBigInt(0);
        let paymentIdIncluded = 0;
        let paymentId = "";
        const dsts = [];
        for (const dest of userDestinations) {
          totalAmountWithoutFee = totalAmountWithoutFee.add(dest.amount);
          const target = Cn.decode_address(dest.address);
          if (target.intPaymentId !== null) {
            ++paymentIdIncluded;
            paymentId = target.intPaymentId;
            pid_encrypt = true;
          }
          dsts.push({
            address: dest.address,
            amount: new JSBigInt(dest.amount)
          });
        }
        if (paymentIdIncluded > 1) {
          reject("multiple_payment_ids");
          return;
        }
        if (paymentId !== "" && userPaymentId !== "") {
          reject("address_payment_id_conflict_user_payment_id");
          return;
        }
        if (totalAmountWithoutFee.compare(0) <= 0) {
          reject("negative_amount");
          return;
        }
        if (paymentId === "" && userPaymentId !== "") {
          if (userPaymentId.length <= 16 && /^[0-9a-fA-F]+$/.test(userPaymentId)) {
            userPaymentId = ("0000000000000000" + userPaymentId).slice(-16);
          }
          if (userPaymentId.length !== 16 && userPaymentId.length !== 64 || !/^[0-9a-fA-F]{16}$/.test(userPaymentId) && !/^[0-9a-fA-F]{64}$/.test(userPaymentId)) {
            reject("invalid_payment_id");
            return;
          }
          pid_encrypt = userPaymentId.length === 16;
          paymentId = userPaymentId;
        }
        const unspentOuts = _TransactionsExplorer.formatWalletOutsForTx(
          wallet,
          blockchainHeight
        );
        const usingOuts = [];
        let usingOuts_amount = new JSBigInt(0);
        const unusedOuts = unspentOuts.filter((out) => out.amount > Number(config.dustThreshold));
        const totalAmount = totalAmountWithoutFee.add(neededFee);
        function pop_random_value(list) {
          const idx = Math.floor(MathUtil.randomFloat() * list.length);
          const val = list[idx];
          list.splice(idx, 1);
          return val;
        }
        while (usingOuts_amount.compare(totalAmount) < 0 && unusedOuts.length > 0) {
          const out = pop_random_value(unusedOuts);
          usingOuts.push(out);
          usingOuts_amount = usingOuts_amount.add(out.amount);
        }
        logDebugMsg("Selected outs:", usingOuts);
        logDebugMsg(
          "using amount of " + usingOuts_amount + " for sending " + totalAmountWithoutFee + " with fees of " + neededFee / Math.pow(10, config.coinUnitPlaces) + " CCX"
        );
        confirmCallback(totalAmountWithoutFee, neededFee).then(() => {
          if (usingOuts_amount.compare(totalAmount) < 0) {
            logDebugMsg(
              "Not enough spendable outputs / balance too low (have " + Cn.formatMoneyFull(usingOuts_amount) + " but need " + Cn.formatMoneyFull(totalAmount) + " (estimated fee " + Cn.formatMoneyFull(neededFee) + " CCX included)"
            );
            reject({ error: "balance_too_low" });
            return;
          } else if (usingOuts_amount.compare(totalAmount) > 0) {
            let changeAmount = usingOuts_amount.subtract(totalAmount);
            if (ttl > 0) {
              changeAmount = changeAmount.add(neededFee);
            }
            logDebugMsg(
              "1) Sending change of " + Cn.formatMoneySymbol(changeAmount) + " to " + wallet.getPublicAddress()
            );
            dsts.push({
              address: wallet.getPublicAddress(),
              amount: changeAmount
            });
          }
          logDebugMsg("destinations", dsts);
          const amounts = [];
          for (let l = 0; l < usingOuts.length; l++) {
            amounts.push(usingOuts[l].amount);
          }
          const nbOutsNeeded = mixin + 1;
          const nbOutsRequested = nbOutsNeeded + 3;
          obtainMixOutsCallback(amounts, nbOutsRequested).then((lotsMixOuts) => {
            logDebugMsg("------------------------------mix_outs");
            logDebugMsg("amounts", amounts);
            logDebugMsg("lots_mix_outs", lotsMixOuts);
            const removedDuplicateMixOuts = _TransactionsExplorer.removeDuplicateMixOuts(lotsMixOuts);
            const selectedMixOuts = _TransactionsExplorer.selectMixOuts(
              removedDuplicateMixOuts,
              usingOuts,
              nbOutsNeeded
            );
            const validation = _TransactionsExplorer.validateMixOutsForInputs(
              usingOuts,
              selectedMixOuts,
              mixin
            );
            if (!validation.valid) {
              reject(new Error(validation.reason));
              return;
            }
            _TransactionsExplorer.createRawTx(
              dsts,
              wallet,
              false,
              usingOuts,
              pid_encrypt,
              selectedMixOuts,
              mixin,
              neededFee,
              paymentId,
              message,
              ttl,
              transactionType,
              term
            ).then(
              (data) => {
                resolve(data);
              }
            ).catch((e) => {
              reject(e);
            });
          }).catch(reject);
        }).catch(reject);
      });
    }
    static createWithdrawTx(deposit, wallet, blockchainHeight, obtainMixOutsCallback, confirmCallback, mixin = 0, paymentId = "", message = "", ttl = 0, transactionType = "withdraw", term = 0) {
      return new Promise((resolve, reject) => {
        const lockedAmount = deposit.amount;
        const totalInterest = deposit.interest;
        const totalAmount = lockedAmount + totalInterest;
        const pid_encrypt = false;
        if (deposit.unlockHeight > blockchainHeight) {
          reject(new Error("Deposit is still locked"));
          return;
        }
        logDebugMsg("Withdrawing deposit with amount", totalAmount);
        const neededFee = new JSBigInt(config.depositSmallWithdrawFee);
        const totalAmountWithoutFee = new JSBigInt(totalAmount);
        if (lockedAmount < 1) {
          reject(new Error("such a deposit cannot could not have been created"));
          return;
        }
        confirmCallback(totalAmountWithoutFee.subtract(neededFee), neededFee).then(() => {
          const usingOuts = [];
          const depositOutput = {
            keyImage: "",
            // Not needed for deposit withdrawal
            amount: deposit.amount,
            public_key: deposit.keys[0],
            // to be corrected
            index: deposit.indexInVout,
            global_index: deposit.globalOutputIndex,
            tx_pub_key: deposit.txPubKey,
            type: "input_to_deposit_key",
            // Specify this is a deposit key input
            required_signatures: 1,
            // We know this is a single-signature deposit
            keys: [deposit.keys[0]]
            // Add the single key from deposit
          };
          usingOuts.push(depositOutput);
          const changeAmount = totalAmountWithoutFee.subtract(neededFee);
          const dsts = [];
          logDebugMsg(
            "Sending withdrawn amount of " + Cn.formatMoneySymbol(changeAmount) + " to " + wallet.getPublicAddress()
          );
          dsts.push({
            address: wallet.getPublicAddress(),
            amount: changeAmount
          });
          logDebugMsg("destinations", dsts);
          const amounts = [];
          for (let l = 0; l < usingOuts.length; l++) {
            amounts.push(usingOuts[l].amount);
          }
          const nbOutsNeeded = mixin + 1;
          obtainMixOutsCallback(amounts, nbOutsNeeded).then((lotsMixOuts) => {
            logDebugMsg("------------------------------mix_outs");
            logDebugMsg("amounts", amounts);
            logDebugMsg("lots_mix_outs", lotsMixOuts);
            _TransactionsExplorer.createRawTx(
              dsts,
              wallet,
              false,
              usingOuts,
              pid_encrypt,
              lotsMixOuts,
              mixin,
              neededFee,
              paymentId,
              message,
              ttl,
              transactionType,
              term
            ).then(
              (data) => {
                resolve(data);
              }
            ).catch((e) => {
              reject(e);
            });
          }).catch((error) => {
            reject(error);
          });
        }).catch((error) => {
          reject(error);
        });
      });
    }
    /**
     * Validates that we have enough valid decoys for each input
     * This ensures we have the required number of mixins (default 5) for each input
     */
    static validateMixOutsForInputs(usingOuts, mixOuts, mixin) {
      if (mixOuts.length !== usingOuts.length) {
        return {
          valid: false,
          reason: "Wrong number of mixout groups provided"
        };
      }
      for (let i = 0; i < usingOuts.length; i++) {
        const out = usingOuts[i];
        const mixOutGroup = mixOuts[i];
        if (!mixOutGroup || mixOutGroup.amount !== out.amount) {
          return {
            valid: false,
            reason: "Mixout group mismatch"
          };
        }
        const availableMixouts = mixOutGroup.outs.length;
        const requiredMixouts = mixin + 1;
        if (availableMixouts < requiredMixouts) {
          return {
            valid: false,
            reason: "Not enough mixouts available, try smaller amount"
          };
        }
      }
      return {
        valid: true,
        reason: "All outputs have sufficient mixouts"
      };
    }
    /**
     * Selects the required number of mixouts for each input from the daemon-provided mixouts
     * Shuffles the available mixouts for additional entropy before selection
     */
    static selectMixOuts(mixOuts, usingOuts, nbOutsNeeded) {
      const selectedMixOuts = [];
      const usedGlobalIndices = /* @__PURE__ */ new Set();
      for (let i = 0; i < usingOuts.length; i++) {
        const out = usingOuts[i];
        const mixOutGroup = mixOuts[i];
        if (mixOutGroup && mixOutGroup.amount === out.amount && mixOutGroup.outs.length > 0) {
          const availableMixouts = mixOutGroup.outs.filter(
            (mixout) => !usedGlobalIndices.has(mixout.global_index)
          );
          if (availableMixouts.length < nbOutsNeeded) {
            console.log(
              `Warning: Not enough unique mixouts for output ${i} (amount ${out.amount}). Need ${nbOutsNeeded}, have ${availableMixouts.length}`
            );
          }
          const shuffledMixouts = [...availableMixouts];
          for (let j = shuffledMixouts.length - 1; j > 0; j--) {
            const k = Math.floor(MathUtil.randomFloat() * (j + 1));
            [shuffledMixouts[j], shuffledMixouts[k]] = [shuffledMixouts[k], shuffledMixouts[j]];
          }
          const selectedMixouts = shuffledMixouts.slice(0, nbOutsNeeded);
          for (const mixout of selectedMixouts) {
            usedGlobalIndices.add(mixout.global_index);
          }
          selectedMixOuts.push({
            amount: out.amount,
            outs: selectedMixouts
          });
        } else {
          console.error(`Error: No valid mixout group found for output ${i} (amount ${out.amount})`);
        }
      }
      return selectedMixOuts;
    }
    static removeDuplicateMixOuts(mixOuts) {
      for (let i = 0; i < mixOuts.length; i++) {
        const group = mixOuts[i];
        const seenInThisGroup = /* @__PURE__ */ new Set();
        const uniqueOuts = [];
        for (const mixout of group.outs) {
          if (!seenInThisGroup.has(mixout.global_index)) {
            seenInThisGroup.add(mixout.global_index);
            uniqueOuts.push(mixout);
          }
        }
        mixOuts[i] = {
          amount: group.amount,
          outs: uniqueOuts
        };
      }
      const globalIndexCounts = /* @__PURE__ */ new Map();
      for (let i = 0; i < mixOuts.length; i++) {
        for (const mixout of mixOuts[i].outs) {
          if (!globalIndexCounts.has(mixout.global_index)) {
            globalIndexCounts.set(mixout.global_index, []);
          }
          const bucket = globalIndexCounts.get(mixout.global_index);
          if (bucket) bucket.push(i);
        }
      }
      for (const [globalIndex, objectIndices] of Array.from(globalIndexCounts.entries())) {
        if (objectIndices.length > 1) {
          let maxMixouts = 0;
          let objectToRemoveFrom = objectIndices[0];
          for (const objectIndex of objectIndices) {
            if (mixOuts[objectIndex].outs.length > maxMixouts) {
              maxMixouts = mixOuts[objectIndex].outs.length;
              objectToRemoveFrom = objectIndex;
            }
          }
          mixOuts[objectToRemoveFrom].outs = mixOuts[objectToRemoveFrom].outs.filter(
            (mixout) => mixout.global_index !== globalIndex
          );
        }
      }
      return mixOuts;
    }
  };

  // lib/config/wallet-network-scalars.mjs
  var walletNetworkScalars = {
    coinUnitPlaces: 6,
    coinFeeAtomic: 1e3,
    minimumFeeV2Atomic: 1e3,
    remoteNodeFeeAtomic: 1e4,
    feePerKBAtomic: 1e3,
    defaultDustThresholdAtomic: 10,
    messageTxAmountAtomic: 100,
    depositMinAmountCoin: 1,
    depositMinTermMonth: 1,
    depositMinTermBlock: 21900,
    depositMaxTermMonth: 12,
    depositSmallWithdrawFee: 10,
    avgBlockTime: 120,
    maxMessageSize: 260,
    cryptonoteMemPoolTxLifetimeSeconds: 60 * 60 * 12
  };

  // lib/config/config.ts
  var walletNetworkScalars2 = walletNetworkScalars;
  var COIN_UNIT_PLACES = walletNetworkScalars2.coinUnitPlaces;
  var COIN_FEE_ATOMIC = walletNetworkScalars2.coinFeeAtomic;
  var REMOTE_NODE_FEE_ATOMIC = walletNetworkScalars2.remoteNodeFeeAtomic;
  var DEPOSIT_SMALL_WITHDRAW_FEE_ATOMIC = walletNetworkScalars2.depositSmallWithdrawFee;
  var DEPOSIT_MIN_TERM_MONTH = walletNetworkScalars2.depositMinTermMonth;
  var DEPOSIT_MAX_TERM_MONTH = walletNetworkScalars2.depositMaxTermMonth;
  var DEPOSIT_MIN_TERM_BLOCK = walletNetworkScalars2.depositMinTermBlock;
  var AVG_BLOCK_TIME_SECONDS = walletNetworkScalars2.avgBlockTime;
  var MAX_MESSAGE_SIZE = walletNetworkScalars2.maxMessageSize;
  var MAX_TTL_MINUTES = walletNetworkScalars2.cryptonoteMemPoolTxLifetimeSeconds / 60;
  var MESSAGE_TX_AMOUNT_ATOMIC = walletNetworkScalars2.messageTxAmountAtomic;
  var DUST_THRESHOLD_ATOMIC = walletNetworkScalars2.defaultDustThresholdAtomic;
  var SENT_MESSAGE_AMOUNT_SELF_ATOMIC = MESSAGE_TX_AMOUNT_ATOMIC + REMOTE_NODE_FEE_ATOMIC;
  var SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC = SENT_MESSAGE_AMOUNT_SELF_ATOMIC + COIN_FEE_ATOMIC;

  // lib/wallet-core/wallet-conversation-persistence.ts
  function walletHasTransaction(wallet, hash) {
    if (!hash) return false;
    if (wallet.findWithTxHash(hash) !== null) return true;
    return wallet.txsMem.some((tx) => tx.hash === hash);
  }
  function rehydrateWalletConversationMetadata(wallet) {
    for (const transaction of wallet.txsMem.concat(wallet.getTransactionsCopy())) {
      wallet.hydrateSentMessageBody(transaction);
    }
  }
  function restoreSentMessageTransactionStubs(wallet) {
    for (const record of wallet.listSentMessageRecords()) {
      if (!record.txHash || walletHasTransaction(wallet, record.txHash)) continue;
      const transaction = new Transaction();
      transaction.hash = record.txHash;
      transaction.txPubKey = record.txHash;
      transaction.blockHeight = 0;
      transaction.timestamp = Math.floor(Date.now() / 1e3);
      transaction.remoteAddress = record.receiver ?? "";
      transaction.message = record.messageBody;
      if (record.paymentIdTo) transaction.paymentId = record.paymentIdTo;
      else if (record.paymentId) transaction.paymentId = record.paymentId;
      const input = new TransactionIn();
      input.amount = SENT_MESSAGE_AMOUNT_SELF_ATOMIC;
      input.type = "02";
      transaction.ins = [input];
      wallet.addNewMemTx(transaction);
    }
  }
  function prepareWalletConversationData(wallet) {
    restoreSentMessageTransactionStubs(wallet);
    rehydrateWalletConversationMetadata(wallet);
  }

  // lib/wallet-core/sent-messages.ts
  function normalizeEntry(item) {
    if (!item || typeof item !== "object") return null;
    const raw = item;
    const txHash = typeof raw.txHash === "string" ? raw.txHash.trim() : "";
    const messageBody = typeof raw.messageBody === "string" ? raw.messageBody : "";
    const receiver = typeof raw.receiver === "string" ? raw.receiver.trim() : "";
    if (!txHash || !messageBody.trim()) return null;
    const record = { txHash, messageBody, receiver };
    if (typeof raw.paymentIdTo === "string" && raw.paymentIdTo.trim()) {
      record.paymentIdTo = raw.paymentIdTo.trim();
    } else if (typeof raw.paymentId === "string" && raw.paymentId.trim()) {
      record.paymentIdTo = raw.paymentId.trim();
    }
    return record;
  }
  function normalizeSentMessagesFromRaw(raw) {
    if (raw === null || raw === void 0) return [];
    if (Array.isArray(raw)) {
      return raw.map(normalizeEntry).filter((entry) => entry !== null);
    }
    if (typeof raw === "object") {
      return Object.entries(raw).map(([txHash, messageBody]) => ({
        txHash,
        messageBody: String(messageBody),
        receiver: ""
      })).filter((entry) => entry.txHash && entry.messageBody.trim());
    }
    return [];
  }
  function indexSentMessageRecords(records) {
    const map = /* @__PURE__ */ new Map();
    for (const record of records) {
      map.set(record.txHash, record);
    }
    return map;
  }

  // lib/wallet-core/keys-normalize.ts
  function analyzeKeysShape(keys) {
    if (!keys || typeof keys !== "object") {
      return { kind: "invalid" };
    }
    const k = keys;
    if (k.priv && k.pub) {
      const priv = k.priv;
      const pub = k.pub;
      const spend2 = priv.spend ?? "";
      const view2 = priv.view ?? "";
      if (!pub.spend || !pub.view) {
        if (spend2 !== "") {
          return { kind: "derive_pub", spend: spend2, view: view2 };
        }
        if (pub.spend && view2 !== void 0) {
          return {
            kind: "ready",
            keys: {
              priv: { spend: spend2, view: view2 },
              pub: { spend: pub.spend, view: pub.view ?? "" }
            }
          };
        }
        return { kind: "invalid" };
      }
      return { kind: "ready", keys: k };
    }
    const spend = k.spend;
    const view = k.view;
    if (spend?.sec && view?.sec) {
      return { kind: "derive_pub", spend: spend.sec, view: view.sec };
    }
    return { kind: "invalid" };
  }

  // lib/wallet-core/KeysRepository.ts
  var KeysRepository = class _KeysRepository {
    static fromPriv(spend, view) {
      const pubView = CnUtils.sec_key_to_pub(view);
      const pubSpend = CnUtils.sec_key_to_pub(spend);
      return {
        pub: {
          view: pubView,
          spend: pubSpend
        },
        priv: {
          view,
          spend
        }
      };
    }
    /** Ensure v1 UserKeys shape (pub + priv); rebuild pub keys from priv when missing. */
    static normalizeKeys(keys) {
      const shape = analyzeKeysShape(keys);
      if (shape.kind === "ready") return shape.keys;
      if (shape.kind === "derive_pub") return _KeysRepository.fromPriv(shape.spend, shape.view);
      return null;
    }
  };

  // lib/wallet-core/numbersLab/Observable.ts
  var _Observable = class _Observable {
    constructor() {
      this.observers = {};
    }
    addObserver(eventType, callback) {
      if (!(eventType in this.observers)) this.observers[eventType] = [];
      this.observers[eventType].push(callback);
    }
    removeObserver(eventType, callback) {
      if (!(eventType in this.observers)) return;
      for (const i in this.observers[eventType]) {
        if (this.observers[eventType][i] === callback) {
          this.observers[eventType].splice(i, 1);
          break;
        }
      }
    }
    notify(eventType = _Observable.EVENT_MODIFIED, data = null) {
      if (!(eventType in this.observers)) return;
      const observers = [];
      for (const i in this.observers[eventType]) {
        observers.push(this.observers[eventType][i]);
      }
      for (const i in observers) {
        observers[i](eventType, data);
      }
    }
  };
  _Observable.EVENT_MODIFIED = "modified";
  var Observable = _Observable;

  // lib/wallet-core/Wallet.ts
  var WalletOptions = class _WalletOptions {
    constructor() {
      this.checkMinerTx = false;
      this.readSpeed = 50;
      this.customNode = false;
      this.nodeUrl = "https://explorer.conceal.network/daemon/";
    }
    static fromRaw(raw) {
      const options = new _WalletOptions();
      if (typeof raw.checkMinerTx !== "undefined") options.checkMinerTx = raw.checkMinerTx;
      if (typeof raw.readSpeed !== "undefined") options.readSpeed = raw.readSpeed;
      if (typeof raw.customNode !== "undefined") options.customNode = raw.customNode;
      if (typeof raw.nodeUrl !== "undefined") options.nodeUrl = raw.nodeUrl;
      return options;
    }
    exportToJson() {
      const data = {
        readSpeed: this.readSpeed,
        checkMinerTx: this.checkMinerTx,
        customNode: this.customNode,
        nodeUrl: this.nodeUrl
      };
      return data;
    }
  };
  var Wallet = class _Wallet extends Observable {
    constructor() {
      super(...arguments);
      this._lastHeight = 0;
      this.transactions = [];
      this.withdrawals = [];
      this.deposits = [];
      this.keyLookupMap = /* @__PURE__ */ new Map();
      this.txLookupMap = /* @__PURE__ */ new Map();
      this.txsMem = [];
      this.modified = true;
      this.modifiedTS = /* @__PURE__ */ new Date();
      this.creationHeight = 0;
      this.txPrivateKeys = {};
      this.coinAddressPrefix = config.addressPrefix;
      this._options = new WalletOptions();
      this.addressBook = [];
      /** Outgoing message records keyed by tx hash — persisted in wallet blob, not on chain. */
      this.sentMessageRecords = /* @__PURE__ */ new Map();
      this.pendingMessageTargets = /* @__PURE__ */ new Map();
      this.signalChanged = () => {
        this.modifiedTS = /* @__PURE__ */ new Date();
        this.modified = true;
      };
      this.exportToRaw = () => {
        const deposits = [];
        const withdrawals = [];
        const transactions = [];
        for (const deposit of this.deposits) {
          deposits.push(deposit.export());
        }
        for (const withdrawal of this.withdrawals) {
          withdrawals.push(withdrawal.export());
        }
        const pushExportedTransaction = (transaction) => {
          const exported = transaction.export();
          if (transaction.hash && this.sentMessageRecords.has(transaction.hash) && exported.message) {
            delete exported.message;
          }
          transactions.push(exported);
        };
        const seenHashes = /* @__PURE__ */ new Set();
        const seenPubKeys = /* @__PURE__ */ new Set();
        for (const transaction of this.transactions) {
          if (transaction.hash) seenHashes.add(transaction.hash);
          if (transaction.txPubKey) seenPubKeys.add(transaction.txPubKey);
          pushExportedTransaction(transaction);
        }
        for (const transaction of this.txsMem) {
          if (transaction.hash && seenHashes.has(transaction.hash)) continue;
          if (transaction.txPubKey && seenPubKeys.has(transaction.txPubKey)) continue;
          pushExportedTransaction(transaction);
        }
        const data = {
          deposits,
          withdrawals,
          transactions,
          txPrivateKeys: this.txPrivateKeys,
          lastHeight: this._lastHeight,
          nonce: "",
          options: this._options,
          coinAddressPrefix: this.coinAddressPrefix
        };
        data.keys = this.keys;
        if (this.creationHeight !== 0) {
          data.creationHeight = this.creationHeight;
        }
        if (this.addressBook.length > 0) {
          data.addressBook = this.addressBook.slice();
        }
        if (this.sentMessageRecords.size > 0) {
          const persistable = Array.from(this.sentMessageRecords.values()).filter((record) => {
            const tx = this.txsMem.find((t) => t.hash === record.txHash);
            return !tx || tx.ttl === 0 || tx.blockHeight !== 0;
          });
          if (persistable.length > 0) data.sentMessages = persistable;
        }
        return data;
      };
      this.isViewOnly = () => {
        return this.keys.priv.spend === "";
      };
      this.listAddressBook = () => {
        return this.addressBook.slice();
      };
      this.createAddressEntry = (entry) => {
        this.addressBook.push(entry);
        this.signalChanged();
        this.notify();
        return entry;
      };
      this.updateAddressEntry = (id, input) => {
        const index = this.addressBook.findIndex((entry) => entry.id === id);
        if (index === -1) return null;
        const updated = { id, ...input };
        this.addressBook[index] = updated;
        this.signalChanged();
        this.notify();
        return updated;
      };
      this.deleteAddressEntry = (id) => {
        const index = this.addressBook.findIndex((entry) => entry.id === id);
        if (index === -1) return false;
        this.addressBook.splice(index, 1);
        this.signalChanged();
        this.notify();
        return true;
      };
      this.setPendingMessageTarget = (hash, remoteAddress, paymentId, body) => {
        this.pendingMessageTargets.set(hash, { remoteAddress, paymentId });
        if (body) {
          this.saveSentMessageRecord({
            txHash: hash,
            messageBody: body,
            receiver: remoteAddress,
            paymentIdTo: paymentId || void 0
          });
        }
        for (const tx of this.txsMem.concat(this.transactions)) {
          if (tx.hash === hash) this.applyPendingMessageTarget(tx);
        }
        this.signalChanged();
        this.notify();
      };
      this.saveSentMessageRecord = (record) => {
        if (!record.txHash || !record.messageBody.trim()) return;
        this.sentMessageRecords.set(record.txHash, { ...record });
        for (const tx of this.txsMem.concat(this.transactions)) {
          if (tx.hash === record.txHash) this.hydrateSentMessageBody(tx);
        }
        this.signalChanged();
        this.notify();
      };
      this.getSentMessageRecord = (hash) => {
        return hash ? this.sentMessageRecords.get(hash) : void 0;
      };
      this.listSentMessageRecords = () => {
        return Array.from(this.sentMessageRecords.values());
      };
      this.hydrateSentMessageBody = (transaction) => {
        if (!transaction.hash) return;
        const record = this.sentMessageRecords.get(transaction.hash);
        if (!record) return;
        if (!transaction.message) transaction.message = record.messageBody;
        if (!transaction.remoteAddress && record.receiver) {
          transaction.remoteAddress = record.receiver;
        }
      };
      this.applyPendingMessageTarget = (transaction) => {
        if (!transaction.hash) return;
        const pending = this.pendingMessageTargets.get(transaction.hash);
        if (pending) {
          if (!transaction.remoteAddress) transaction.remoteAddress = pending.remoteAddress;
          if (pending.paymentId && !transaction.paymentId) transaction.paymentId = pending.paymentId;
        }
        this.hydrateSentMessageBody(transaction);
      };
      this.preserveMessageTransactionMeta = (next, previous) => {
        if (previous.message && !next.message) next.message = previous.message;
        if (!next.message) this.hydrateSentMessageBody(next);
        if (previous.messageViewed) next.messageViewed = previous.messageViewed || next.messageViewed;
        if (previous.remoteAddress && !next.remoteAddress) next.remoteAddress = previous.remoteAddress;
        if (previous.paymentId && !next.paymentId) next.paymentId = previous.paymentId;
      };
      this.getAll = (_forceReload = false) => {
        return this.transactions.slice();
      };
      this.getAllOuts = () => {
        const alls = this.getAll();
        const outs = [];
        for (const tr of alls) {
          outs.push.apply(outs, tr.outs);
        }
        return outs;
      };
      this.addNew = (transaction, replace = true) => {
        if (transaction) {
          this.applyPendingMessageTarget(transaction);
          const exist = this.findWithTxPubKey(transaction.txPubKey);
          if (!exist || replace) {
            if (!exist) {
              this.keyLookupMap.set(transaction.txPubKey, transaction);
              this.txLookupMap.set(transaction.hash, transaction);
              this.transactions.push(transaction);
            } else {
              for (let tr = 0; tr < this.transactions.length; ++tr) {
                if (this.transactions[tr].txPubKey === transaction.txPubKey) {
                  transaction.fusion = this.transactions[tr].fusion;
                  transaction.minerReward = transaction.minerReward || this.transactions[tr].minerReward;
                  transaction.messageViewed = this.transactions[tr].messageViewed || transaction.messageViewed;
                  this.preserveMessageTransactionMeta(transaction, this.transactions[tr]);
                  this.keyLookupMap.set(transaction.txPubKey, transaction);
                  this.txLookupMap.set(transaction.hash, transaction);
                  this.transactions[tr] = transaction;
                }
              }
            }
            const existMem = this.findMemWithTxPubKey(transaction.txPubKey);
            if (existMem) {
              transaction.fusion = existMem.fusion;
              transaction.messageViewed = existMem.messageViewed || transaction.messageViewed;
              this.preserveMessageTransactionMeta(transaction, existMem);
              const trIndex = this.txsMem.indexOf(existMem);
              if (trIndex !== -1) {
                this.txsMem.splice(trIndex, 1);
              }
            }
            this.recalculateKeyImages();
            this.signalChanged();
            this.notify();
          }
        }
      };
      /**
       * Update a flag on an existing transaction by txPubKey or hash.
       * Only updates the specified fields, does not replace the transaction object.
       */
      this.updateTransactionFlags = (txPubKeyOrHash, flags) => {
        const tx = this.findWithTxPubKey(txPubKeyOrHash) || this.findWithTxHash(txPubKeyOrHash);
        if (tx) {
          if (typeof flags.fusion !== "undefined") tx.fusion = flags.fusion;
          if (typeof flags.messageViewed !== "undefined") tx.messageViewed = flags.messageViewed;
          this.signalChanged();
          this.notify();
          return true;
        }
        return false;
      };
      this.addDeposits = (deposits) => {
        for (let i = 0; i < deposits.length; ++i) {
          this.addDeposit(deposits[i]);
        }
      };
      this.addDeposit = (deposit) => {
        let foundMatch = false;
        for (let i = 0; i < this.deposits.length; ++i) {
          if (this.deposits[i].txHash === deposit.txHash) {
            this.deposits[i] = deposit;
            foundMatch = true;
            break;
          }
        }
        if (!foundMatch) {
          this.deposits.push(deposit);
        }
        this.signalChanged();
        this.notify();
      };
      this.updateDepositFlags = (txHashOrPubKey, flags) => {
        const deposit = this.deposits.find(
          (d) => d.txHash === txHashOrPubKey || d.txPubKey === txHashOrPubKey
        );
        if (deposit) {
          if (typeof flags.withdrawPending !== "undefined")
            deposit.withdrawPending = flags.withdrawPending;
          this.signalChanged();
          this.notify();
          return true;
        }
        return false;
      };
      this.addWithdrawals = (withdrawals) => {
        for (let i = 0; i < withdrawals.length; ++i) {
          this.addWithdrawal(withdrawals[i]);
        }
      };
      this.addWithdrawal = (withdrawal) => {
        let foundMatchDeposit = false;
        let foundMatchWithdrawal = false;
        for (let i = 0; i < this.deposits.length; ++i) {
          if (this.deposits[i].withdrawPending === true && this.deposits[i].amount === withdrawal.amount && this.deposits[i].globalOutputIndex === withdrawal.globalOutputIndex) {
            this.deposits[i].spentTx = withdrawal.txHash;
            this.deposits[i].withdrawPending = false;
            foundMatchDeposit = true;
            break;
          }
        }
        if (!foundMatchDeposit) {
          for (let i = 0; i < this.deposits.length; ++i) {
            if (this.deposits[i].amount === withdrawal.amount && this.deposits[i].globalOutputIndex === withdrawal.globalOutputIndex && !this.deposits[i].spentTx) {
              this.deposits[i].spentTx = withdrawal.txHash;
              foundMatchDeposit = true;
              break;
            }
          }
        }
        for (let i = 0; i < this.withdrawals.length; ++i) {
          if (this.withdrawals[i].txHash === withdrawal.txHash) {
            this.withdrawals[i] = withdrawal;
            foundMatchWithdrawal = true;
            break;
          }
        }
        if (!foundMatchWithdrawal) {
          for (let i = 0; i < this.withdrawals.length; ++i) {
            if (this.withdrawals[i].amount === withdrawal.amount && this.withdrawals[i].globalOutputIndex === withdrawal.globalOutputIndex) {
              this.withdrawals[i] = withdrawal;
              foundMatchWithdrawal = true;
              break;
            }
          }
        }
        if (!foundMatchWithdrawal) {
          this.withdrawals.push(withdrawal);
        }
        this.signalChanged();
        this.notify();
      };
      this.addNewMemTx = (transaction, replace = true) => {
        this.applyPendingMessageTarget(transaction);
        let modified = false;
        let foundTx = false;
        for (let i = 0; i < this.txsMem.length; ++i) {
          if (this.txsMem[i].hash === transaction.hash) {
            if (replace) {
              this.preserveMessageTransactionMeta(transaction, this.txsMem[i]);
              this.txsMem[i] = transaction;
              modified = true;
            }
            foundTx = true;
          }
        }
        if (!foundTx) {
          this.txsMem.push(transaction);
          modified = true;
        }
        if (modified) {
          this.signalChanged();
        }
      };
      this.clearMemTx = () => {
        this.txsMem = [];
      };
      this.findWithTxPubKey = (pubKey) => {
        const transaction = this.keyLookupMap.get(pubKey);
        if (transaction !== void 0) {
          return transaction;
        } else {
          return null;
        }
      };
      this.findWithTxHash = (hash) => {
        const transaction = this.txLookupMap.get(hash);
        if (transaction !== void 0) {
          return transaction;
        } else {
          return null;
        }
      };
      this.findMemWithTxPubKey = (pubKey) => {
        for (const tr of this.txsMem) if (tr.txPubKey === pubKey) return tr;
        return null;
      };
      this.findTxPrivateKeyWithHash = (hash) => {
        if (typeof this.txPrivateKeys[hash] !== "undefined") return this.txPrivateKeys[hash];
        return null;
      };
      this.addTxPrivateKeyWithTxHash = (txHash, txPrivKey) => {
        this.txPrivateKeys[txHash] = txPrivKey;
        this.signalChanged();
      };
      this.addTxPrivateKeyWithTxHashAndFusion = (txHash, txPrivKey, fusion) => {
        this.txPrivateKeys[txHash] = txPrivKey;
        const tx = this.transactions.find((tx2) => tx2.hash === txHash);
        if (tx) tx.fusion = fusion;
        this.signalChanged();
      };
      this.getTransactionKeyImages = () => {
        return this.keyImages;
      };
      this.getTransactionOutIndexes = () => {
        return this.txOutIndexes;
      };
      this.getOutWithGlobalIndex = (index) => {
        for (const tx of this.transactions) {
          for (const out of tx.outs) {
            if (out.globalIndex === index) return out;
          }
        }
        return null;
      };
      this.keyImages = [];
      this.txOutIndexes = [];
      this.getTransactionsCopy = () => {
        const news = [];
        for (const transaction of this.transactions) {
          news.push(Transaction.fromRaw(transaction.export()));
        }
        news.sort((a, b) => {
          return a.timestamp - b.timestamp;
        });
        return news;
      };
      this.getDepositsCopy = () => {
        const news = this.deposits.slice();
        news.sort((a, b) => {
          return a.timestamp - b.timestamp;
        });
        return news;
      };
      this.getWithdrawalsCopy = () => {
        const news = this.withdrawals.slice();
        news.sort((a, b) => {
          return a.timestamp - b.timestamp;
        });
        return news;
      };
      this.availableAmount = (currentBlockHeight = -1) => {
        if (this.isViewOnly()) {
          return this.incomingAmount(currentBlockHeight);
        }
        let amount = 0;
        for (const transaction of this.transactions) {
          if (!transaction.isFullyChecked()) continue;
          if (transaction.isConfirmed(currentBlockHeight) || currentBlockHeight === -1) {
            for (const nout of transaction.outs) {
              if (nout.type !== "03") {
                amount += nout.amount;
              }
            }
          }
          for (const nin of transaction.ins) {
            if (nin.type !== "03") {
              amount -= nin.amount;
            }
          }
        }
        for (const transaction of this.txsMem) {
          if (transaction.isConfirmed(currentBlockHeight) || currentBlockHeight === -1) {
            for (const nout of transaction.outs) {
              if (nout.type !== "03") {
                amount += nout.amount;
              }
            }
          }
          for (const nin of transaction.ins) {
            if (nin.type !== "03") {
              amount -= nin.amount;
            }
          }
        }
        return amount;
      };
      /** View-only: sum confirmed incoming outs (type 02); spends are not subtracted. */
      this.incomingAmount = (currentBlockHeight = -1) => {
        let amount = 0;
        for (const transaction of this.transactions) {
          if (!transaction.isConfirmed(currentBlockHeight) && currentBlockHeight !== -1) {
            continue;
          }
          for (const nout of transaction.outs) {
            if (nout.type !== "03") {
              amount += nout.amount;
            }
          }
        }
        for (const transaction of this.txsMem) {
          if (!transaction.isConfirmed(currentBlockHeight) && currentBlockHeight !== -1) {
            continue;
          }
          for (const nout of transaction.outs) {
            if (nout.type !== "03") {
              amount += nout.amount;
            }
          }
        }
        return amount;
      };
      /**
       * @returns the total atomic value of all confirmed unspent dust outputs.
       * Mirrors conceal-core WalletGreen::getDustBalance(): sum of unlocked outputs where amount < defaultDustThreshold().
       * These outputs are excluded from regular tx input selection and shown separately in the UI as "unspendable" until a fusion (mixin=0) is implemented.
       */
      this.dustAmount = (currentBlockHeight = -1) => {
        const scanHeight = currentBlockHeight === -1 ? Math.max(0, Number(this.lastHeight)) : currentBlockHeight;
        const unspentOuts = TransactionsExplorer.formatWalletOutsForTx(this, scanHeight);
        return unspentOuts.reduce(
          (sum, out) => Currency.isDustOutput(out.amount) ? sum + out.amount : sum,
          0
        );
      };
      this.lockedDeposits = (currHeight) => {
        let amount = 0;
        for (const deposit of this.deposits) {
          if (deposit.blockHeight + deposit.term > currHeight) {
            amount += deposit.amount;
          }
        }
        return amount;
      };
      this.unlockedDeposits = (currHeight) => {
        let amount = 0;
        for (const deposit of this.deposits) {
          if (deposit.blockHeight + deposit.term <= currHeight) {
            if (!deposit.spentTx) {
              amount += deposit.amount;
            }
          }
        }
        return amount;
      };
      // Calculate total future interest (from both locked and unlocked deposits)
      this.futureDepositInterest = (currHeight) => {
        let futureLockedInterest = 0;
        let futureUnlockedInterest = 0;
        let spentInterest = 0;
        for (const deposit of this.deposits) {
          const status = deposit.getStatus(currHeight);
          switch (status) {
            case "Locked":
              futureLockedInterest += deposit.interest;
              break;
            case "Unlocked":
              futureUnlockedInterest += deposit.interest;
              break;
            case "Spent":
              spentInterest += deposit.interest;
              break;
          }
        }
        return {
          spent: spentInterest,
          locked: futureLockedInterest,
          unlocked: futureUnlockedInterest,
          total: futureLockedInterest + futureUnlockedInterest
        };
      };
      // Returns the deposit with the earliest unlock date (not spent)
      this.earliestUnlockableDeposit = (_currHeight) => {
        let earliest = null;
        for (const deposit of this.deposits) {
          if (deposit.isSpent()) continue;
          if (!earliest || deposit.unlockHeight < earliest.unlockHeight) {
            earliest = deposit;
          }
        }
        return earliest;
      };
      this.hasBeenModified = () => {
        return this.modified;
      };
      this.modifiedTimestamp = () => {
        return this.modifiedTS;
      };
      this.getPublicAddress = () => {
        return Cn.pubkeys_to_string(this.keys.pub.spend, this.keys.pub.view);
      };
      this.recalculateIfNotViewOnly = () => {
        if (!this.isViewOnly()) {
          for (const tx of this.transactions) {
            let needDerivation = false;
            for (const out of tx.outs) {
              if (out.keyImage === "") {
                needDerivation = true;
                break;
              }
            }
            if (needDerivation) {
              let derivation = "";
              try {
                derivation = concealjs.crypto.generate_key_derivation(tx.txPubKey, this.keys.priv.view);
              } catch {
                continue;
              }
              for (const out of tx.outs) {
                if (out.keyImage === "") {
                  const m_key_image = CnTransactions.generate_key_image_helper(
                    {
                      view_secret_key: this.keys.priv.view,
                      spend_secret_key: this.keys.priv.spend,
                      public_spend_key: this.keys.pub.spend
                    },
                    tx.txPubKey,
                    out.outputIdx,
                    derivation
                  );
                  out.keyImage = m_key_image.key_image;
                  out.ephemeralPub = m_key_image.ephemeral_pub;
                  this.signalChanged();
                }
              }
            }
          }
          if (this.modified) {
            this.recalculateKeyImages();
          }
          for (let iTx = 0; iTx < this.transactions.length; ++iTx) {
            for (let iIn = 0; iIn < this.transactions[iTx].ins.length; ++iIn) {
              const vin = this.transactions[iTx].ins[iIn];
              if (vin.amount < 0) {
                if (this.keyImages.indexOf(vin.keyImage) !== -1) {
                  const walletOuts = this.getAllOuts();
                  for (const ut of walletOuts) {
                    if (ut.keyImage === vin.keyImage) {
                      this.transactions[iTx].ins[iIn].amount = ut.amount;
                      this.transactions[iTx].ins[iIn].keyImage = ut.keyImage;
                      this.signalChanged();
                      break;
                    }
                  }
                } else {
                  this.transactions[iTx].ins.splice(iIn, 1);
                  --iIn;
                }
              }
            }
            if (this.transactions[iTx].outs.length === 0 && this.transactions[iTx].ins.length === 0) {
              this.transactions.splice(iTx, 1);
              --iTx;
            }
          }
        }
      };
      /**
       * Estimates the fusion readiness of the wallet.
       * @param threshold The threshold amount for fusion.
       * @param blockchainHeight The current blockchain height.
       * @returns { unspentOutsCount: number, fusionReadyCount: number }
       */
      this.estimateFusionReadyness = (threshold, blockchainHeight) => {
        const NUM_BUCKETS = 20;
        const bucketSizes = new Array(NUM_BUCKETS).fill(0);
        const unspentOuts = TransactionsExplorer.formatWalletOutsForTx(
          this,
          blockchainHeight
        );
        const unspentOutsCount = unspentOuts.length;
        for (const out of unspentOuts) {
          const result = Currency.isAmountApplicableInFusionTransactionInput(
            out.amount,
            threshold,
            blockchainHeight
          );
          if (result.applicable && typeof result.amountPowerOfTen === "number") {
            if (result.amountPowerOfTen < NUM_BUCKETS) {
              bucketSizes[result.amountPowerOfTen]++;
            }
          }
        }
        let fusionReadyCount = 0;
        for (const bucketSize of bucketSizes) {
          if (bucketSize >= config.optimizeOutputs) {
            fusionReadyCount += bucketSize;
          }
        }
        return {
          unspentOutsCount,
          fusionReadyCount
        };
      };
      this.pickRandomFusionInputs = (threshold, blockchainHeight, minInputCount = Currency.fusionTxMinInputCount, maxInputCount) => {
        const NUM_BUCKETS = 20;
        const bucketSizes = new Array(NUM_BUCKETS).fill(0);
        const unspentOuts = TransactionsExplorer.formatWalletOutsForTx(
          this,
          blockchainHeight
        );
        const allFusionReadyOuts = [];
        for (const out of unspentOuts) {
          const result = Currency.isAmountApplicableInFusionTransactionInput(
            out.amount,
            threshold,
            blockchainHeight
          );
          if (result.applicable) {
            allFusionReadyOuts.push(out);
            const powerOfTen = result.amountPowerOfTen || 0;
            if (powerOfTen < NUM_BUCKETS) {
              bucketSizes[powerOfTen]++;
            }
          }
        }
        const bucketNumbers = Array.from({ length: NUM_BUCKETS }, (_, i) => i);
        const bucketGenerator = new ShuffleGenerator(NUM_BUCKETS);
        const shuffledBucketNumbers = [];
        for (let i = 0; i < NUM_BUCKETS; i++) {
          shuffledBucketNumbers.push(bucketNumbers[bucketGenerator.next()]);
        }
        const selectedBucket = shuffledBucketNumbers.find(
          (bucket) => bucketSizes[bucket] >= minInputCount
        );
        if (selectedBucket === void 0) {
          return [];
        }
        let lowerBound = 1;
        for (let i = 0; i < selectedBucket; ++i) {
          lowerBound *= 10;
        }
        const upperBound = selectedBucket === NUM_BUCKETS - 1 ? Number.MAX_SAFE_INTEGER : lowerBound * 10;
        const selectedOuts = allFusionReadyOuts.filter(
          (out) => out.amount >= lowerBound && out.amount < upperBound
        );
        if (selectedOuts.length < minInputCount) {
          return [];
        }
        selectedOuts.sort((a, b) => a.amount - b.amount);
        if (selectedOuts.length > maxInputCount) {
          const generator = new ShuffleGenerator(selectedOuts.length);
          const trimmedSelectedOuts = [];
          for (let i = 0; i < maxInputCount; ++i) {
            trimmedSelectedOuts.push(selectedOuts[generator.next()]);
          }
          trimmedSelectedOuts.sort((a, b) => a.amount - b.amount);
          return trimmedSelectedOuts;
        }
        return selectedOuts;
      };
      this.optimizationNeeded = (blockchainHeight, threshold) => {
        const unspentOuts = TransactionsExplorer.formatWalletOutsForTx(
          this,
          blockchainHeight
        );
        const unspentOutsCount = unspentOuts.length;
        let isNeeded = false;
        if (unspentOutsCount < config.optimizeOutputs) {
          return {
            numOutputs: unspentOutsCount,
            isNeeded: false
          };
        }
        const balance = this.availableAmount(blockchainHeight);
        let fusionReady = false;
        while (threshold <= balance && !fusionReady) {
          const estimation = this.estimateFusionReadyness(threshold, blockchainHeight);
          if (estimation.fusionReadyCount > config.optimizeOutputs / 2) {
            fusionReady = true;
            break;
          } else {
            threshold = 10 * threshold;
          }
        }
        if (fusionReady) {
          isNeeded = true;
        } else {
          logDebugMsg("Nothing to optimize, unspentOutsCount", unspentOutsCount);
        }
        return {
          numOutputs: unspentOutsCount,
          isNeeded
        };
      };
      this.createFusionTransaction = async (blockchainHeight, threshold, blockchainExplorer, obtainMixOutsCallback) => {
        const MAX_FUSION_OUTPUTS = config.maxFusionOutputs;
        const fusionThreshold = config.dustThreshold;
        const neededFee = config.minimumFee_V2;
        if (threshold <= fusionThreshold) {
          throw new Error("Threshold is too low");
        }
        const destinationAddress = this.getPublicAddress();
        if (destinationAddress === "") {
          throw new Error("Destination address is not set");
        }
        const estimateFusionInputsCount = Currency.getApproximateMaximumInputCount(
          Currency.fusionTxMaxSize,
          MAX_FUSION_OUTPUTS,
          config.defaultMixin
        );
        if (estimateFusionInputsCount < Currency.fusionTxMinInputCount) {
          throw new Error("Mixin count is too big");
        }
        const fusionInputs = this.pickRandomFusionInputs(
          threshold,
          blockchainHeight,
          Currency.fusionTxMinInputCount,
          estimateFusionInputsCount
        );
        if (fusionInputs.length < Currency.fusionTxMinInputCount) {
          throw new Error("Nothing to optimize");
        }
        let fusionTransaction = null;
        let transactionSize = 0;
        let round = 0;
        do {
          if (round !== 0) {
            fusionInputs.pop();
          }
          const inputAmounts = fusionInputs.map((input) => input.amount);
          let mixinResult = [];
          if (config.defaultMixin !== 0) {
            mixinResult = await obtainMixOutsCallback(inputAmounts, config.defaultMixin + 1);
          }
          const inputsAmount = fusionInputs.reduce((sum, input) => sum + input.amount, 0);
          const dsts = [
            {
              address: destinationAddress,
              amount: inputsAmount - neededFee
            }
          ];
          const data = await TransactionsExplorer.createRawTx(
            dsts,
            this,
            false,
            fusionInputs,
            false,
            mixinResult,
            config.defaultMixin,
            neededFee,
            "",
            "",
            0,
            "regular",
            0
          );
          transactionSize = Currency.getApproximateTransactionSize(
            data.signed.vin.length,
            data.signed.vout.length,
            config.defaultMixin
          );
          fusionTransaction = data;
          round++;
        } while (transactionSize > Currency.fusionTxMaxSize && fusionInputs.length >= Currency.fusionTxMinInputCount);
        if (fusionInputs.length < Currency.fusionTxMinInputCount) {
          throw new Error("Minimum input count not met");
        }
        if (!fusionTransaction || fusionTransaction.signed.vout.length === 0) {
          throw new Error("Transaction has no outputs");
        }
        if (fusionTransaction.signed.vout.length > MAX_FUSION_OUTPUTS) {
          throw new Error("Maximum output count exceeded");
        }
        await blockchainExplorer.sendRawTx(fusionTransaction.raw.raw);
        this.addTxPrivateKeyWithTxHashAndFusion(
          fusionTransaction.raw.hash,
          fusionTransaction.raw.prvkey,
          true
        );
        return round;
      };
      this.clearTransactions = () => {
        this.txsMem = [];
        this.deposits = [];
        this.withdrawals = [];
        this.transactions = [];
        this.txLookupMap.clear();
        this.keyLookupMap.clear();
        this.recalculateKeyImages;
        this.notify();
      };
      this.resetScanHeight = () => {
        this.lastHeight = this.creationHeight;
        this.signalChanged();
        this.notify();
      };
    }
    static loadFromRaw(raw) {
      const wallet = new _Wallet();
      wallet.transactions = [];
      wallet.withdrawals = [];
      wallet.deposits = [];
      wallet.keyLookupMap.clear();
      wallet.txLookupMap.clear();
      if (raw.deposits) {
        for (const rawDeposit of raw.deposits) {
          const deposit = Deposit.fromRaw(rawDeposit);
          wallet.deposits.push(deposit);
        }
      }
      if (raw.withdrawals) {
        for (const rawWithdrawal of raw.withdrawals) {
          const withdrawal = Withdrawal.fromRaw(rawWithdrawal);
          wallet.withdrawals.push(withdrawal);
        }
      }
      if (raw.transactions) {
        for (const rawTransac of raw.transactions) {
          const transaction = Transaction.fromRaw(rawTransac);
          wallet.transactions.push(transaction);
          wallet.txLookupMap.set(transaction.hash, transaction);
          wallet.keyLookupMap.set(transaction.txPubKey, transaction);
        }
      }
      wallet._lastHeight = raw.lastHeight;
      if (typeof raw.encryptedKeys === "string" && raw.encryptedKeys !== "") {
        if (raw.encryptedKeys.length === 128) {
          const privView = raw.encryptedKeys.substr(0, 64);
          const privSpend = raw.encryptedKeys.substr(64, 64);
          wallet.keys = KeysRepository.fromPriv(privSpend, privView);
        } else {
          const privView = raw.encryptedKeys.substr(0, 64);
          const pubViewKey = raw.encryptedKeys.substr(64, 64);
          const pubSpendKey = raw.encryptedKeys.substr(128, 64);
          wallet.keys = {
            pub: {
              view: pubViewKey,
              spend: pubSpendKey
            },
            priv: {
              view: privView,
              spend: ""
            }
          };
        }
      } else if (typeof raw.keys !== "undefined") {
        wallet.keys = KeysRepository.normalizeKeys(raw.keys) ?? raw.keys;
      }
      if (typeof raw.creationHeight !== "undefined") wallet.creationHeight = raw.creationHeight;
      if (typeof raw.options !== "undefined") wallet._options = WalletOptions.fromRaw(raw.options);
      if (typeof raw.txPrivateKeys !== "undefined") wallet.txPrivateKeys = raw.txPrivateKeys;
      if (typeof raw.coinAddressPrefix !== "undefined")
        wallet.coinAddressPrefix = raw.coinAddressPrefix;
      else wallet.coinAddressPrefix = config.addressPrefix;
      if (typeof raw.addressBook !== "undefined") {
        wallet.addressBook = raw.addressBook.slice();
      }
      if (typeof raw.sentMessages !== "undefined") {
        wallet.sentMessageRecords = indexSentMessageRecords(
          normalizeSentMessagesFromRaw(raw.sentMessages)
        );
      }
      prepareWalletConversationData(wallet);
      wallet.recalculateKeyImages();
      return wallet;
    }
    get lastHeight() {
      return this._lastHeight;
    }
    set lastHeight(value) {
      const modified = value !== this._lastHeight;
      this._lastHeight = value;
      if (modified) {
        this.notify();
      }
    }
    get options() {
      return this._options;
    }
    set options(value) {
      this._options = value;
      this.signalChanged();
    }
    recalculateKeyImages() {
      const keys = [];
      const indexes = [];
      for (const transaction of this.transactions) {
        for (const out of transaction.outs) {
          if (out.keyImage !== null && out.keyImage !== "") keys.push(out.keyImage);
          if (out.globalIndex !== 0) indexes.push(out.globalIndex);
        }
      }
      this.keyImages = keys;
      this.txOutIndexes = indexes;
    }
    /**
     * Checks if there are any pending deposits in the wallet.
     * @returns {boolean} True if there is at least one pending deposit
     */
    get hasPendingDeposit() {
      for (const tx of this.txsMem) {
        for (const out of tx.outs) {
          if (out.type === "03" && (out.globalIndex === void 0 || out.globalIndex === 0)) {
            return true;
          }
        }
      }
      return false;
    }
    get amount() {
      return this.availableAmount(-1);
    }
  };
  var ShuffleGenerator = class {
    constructor(size) {
      this.indices = Array.from({ length: size }, (_, i) => i);
      this.currentIndex = size;
      this.shuffle();
    }
    shuffle() {
      for (let i = this.indices.length - 1; i > 0; i--) {
        const j = Math.floor(MathUtil.randomFloat() * (i + 1));
        [this.indices[i], this.indices[j]] = [this.indices[j], this.indices[i]];
      }
    }
    next() {
      if (this.currentIndex === 0) {
        this.shuffle();
        this.currentIndex = this.indices.length;
      }
      return this.indices[--this.currentIndex];
    }
  };

  // lib/wallet-core/workers/sync-worker-entry.ts
  self.onmessage = (data) => {
    const event = data.data;
    try {
      if (event.type === "initWallet") {
        postMessage({ type: "readyWallet" });
      } else if (event.type === "screen") {
        const readMinersTx = typeof event.readMinersTx !== "undefined" && event.readMinersTx;
        const rawTransactions = event.transactions;
        const maxBlockNumber = event.maxBlock;
        const startBlockNumber = typeof event.startBlock !== "undefined" ? event.startBlock : 0;
        const shardIndex = typeof event.shardIndex !== "undefined" ? event.shardIndex : 0;
        const currentWallet = Wallet.loadFromRaw(event.wallet);
        let hashes = [];
        if (!currentWallet) {
          postMessage("missing_wallet");
          return;
        }
        try {
          hashes = TransactionsExplorer.screenShardForOwnedHashes(
            rawTransactions,
            currentWallet,
            readMinersTx
          );
        } catch (err) {
          console.error("Failed to screen shard:", err);
        }
        postMessage({
          type: "screened",
          startBlock: startBlockNumber,
          maxHeight: maxBlockNumber,
          shardIndex,
          hashes
        });
      } else if (event.type === "process") {
        logDebugMsg("process new transactions...");
        const readMinersTx = typeof event.readMinersTx !== "undefined" && event.readMinersTx;
        const screenedOwned = typeof event.screenedOwned !== "undefined" && event.screenedOwned;
        const rawTransactions = event.transactions;
        const maxBlockNumber = event.maxBlock;
        const startBlockNumber = typeof event.startBlock !== "undefined" ? event.startBlock : 0;
        const currentWallet = Wallet.loadFromRaw(event.wallet);
        const transactions = [];
        logDebugMsg("rawTransactions", rawTransactions);
        if (!currentWallet) {
          logDebugMsg("Wallet is missing...");
          postMessage("missing_wallet");
          return;
        }
        const addedHashes = /* @__PURE__ */ new Set();
        const tryProcessTx = (rawTransaction) => {
          if (!currentWallet) {
            return;
          }
          if (!rawTransaction?.height) {
            return;
          }
          if (rawTransaction.hash && addedHashes.has(rawTransaction.hash)) {
            return;
          }
          if (!readMinersTx && TransactionsExplorer.isMinerTx(rawTransaction)) {
            return;
          }
          const isOwned = screenedOwned || TransactionsExplorer.ownsTx(rawTransaction, currentWallet);
          if (!isOwned) {
            return;
          }
          const txData = TransactionsExplorer.parse(rawTransaction, currentWallet);
          if (txData?.transaction) {
            currentWallet.addNew(txData.transaction);
            currentWallet.addDeposits(txData.deposits);
            currentWallet.addWithdrawals(txData.withdrawals);
            transactions.push(txData.export());
          }
          if (rawTransaction.hash) {
            addedHashes.add(rawTransaction.hash);
          }
        };
        for (let pass = 0; pass < 2; pass++) {
          for (const rawTransaction of rawTransactions) {
            try {
              tryProcessTx(rawTransaction);
            } catch (err) {
              console.error("Failed to process tx:", rawTransaction.hash ?? rawTransaction, err);
            }
          }
        }
        postMessage({
          type: "processed",
          startBlock: startBlockNumber,
          maxHeight: maxBlockNumber,
          transactions
        });
      }
    } catch (err) {
      reportError(err);
    }
  };
  postMessage("ready");
})();
