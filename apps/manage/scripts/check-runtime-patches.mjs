import console from "node:console";
import process from "node:process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

const frontendRoot = fileURLToPath(new URL("../", import.meta.url));
// 对应随包补丁实际生成的 ES/CJS 文件。升级需同时通过双引擎焦点边界契约。
const expectedRuntime = {
  util: { version: "1.13.0", files: {
    "es/Dom/focus.js": "63c438f791345214668fc7ef7721ec4ea6fdb2eb29c807783ccc1de13714db32",
    "lib/Dom/focus.js": "4a064b0d1d4711425691ede255f1342fa0786ebba9903c866d57077b64517e0d"
  } },
  drawer: { version: "1.4.2", files: {
    "es/Drawer.js": "e2bebce8a7a90519ad163260ba1c64392133fd117e982c3a91f12ef6689e3211",
    "lib/Drawer.js": "c394471ab1c64fbdfa236cc023e6486cf21971192efa09333e85d58f1770c12b"
  } },
  picker: { version: "1.12.2", files: {
    "es/PickerTrigger/index.js": "285ff306858c3aec50081898d2504a14c88acb172d9726e2b1a3dc7bacdba664",
    "lib/PickerTrigger/index.js": "cacdc0548edfaa73ce9cd4e08be3997c5aaca7541ef8731f305d27e31cb450e8"
  } }
};

/** 审计真正由 Ant 解析到的依赖，不能以虚拟存储中另一个已修版本冒充。 */
export function auditAntRuntime(root, expected = expectedRuntime) {
  try {
    const ant = createRequire(path.join(root, "package.json")).resolve("antd/package.json");
    const drawer = createRequire(ant).resolve("@rc-component/drawer/package.json");
    const util = createRequire(drawer).resolve("@rc-component/util/package.json");
    // picker 的 exports 不公开 package.json，按实际公开入口定位其固定版本包根。
    const pickerEntry = createRequire(ant).resolve("@rc-component/picker");
    const picker = path.resolve(path.dirname(pickerEntry), "../package.json");
    const packages = { drawer, util, picker };
    const errors = [];
    for (const [name, contract] of Object.entries(expected)) {
      const manifest = packages[name];
      const version = JSON.parse(readFileSync(manifest, "utf8")).version;
      if (version !== contract.version) errors.push(`Ant 实际解析 ${name} ${version}，要求来源固定版本 ${contract.version}`);
      for (const [relative, expectedHash] of Object.entries(contract.files)) {
        const file = path.join(path.dirname(manifest), relative);
        const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
        if (actual !== expectedHash) errors.push(`Ant ${name} 运行时补丁未实际生效：${relative}`);
      }
    }
    return errors;
  } catch (error) {
    return [`Ant 运行时依赖不完整：${error.message}`];
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const errors = auditAntRuntime(frontendRoot);
  if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
  else console.log("Ant Drawer 运行时门禁通过：来源版本与 util、Drawer、Picker 的 ES/CJS 补丁实际命中");
}
