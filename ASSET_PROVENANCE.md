# Relaxs — 素材来源与 Tripo 使用记录

参赛团队：**袁宠、秦岱**；所属方向：**数据工程**。这是团队成员的个人参赛项目，**不是 VAST 工作成果**。该身份说明来自提交人，本文件不将任职单位列为作品作者或权利人。

核验范围为当前工作区的 `src/`、既有 `dist/`、`artifacts/tripo/`、实际使用的第三方代码及音频实现；没有重新构建、上传或核验外部线上演示。下列摘要及 GLB 指纹标识本次核验的素材快照。

## 可直接用于「Tripo 使用情况」的说明

Relaxs 将 Tripo 文字生成的 **19 种形象**用于人物、怪兽、车辆、海洋生物、家具、植物和水果，并使用 Tripo 自动绑骨处理球手与骑手。当前发布包包含 **20 个运行时模型资源项**：18 个直接生成输出、2 个绑骨输出。球手原模与绑骨版是同一形象；骑手原模另有生成记录，运行时只注册其绑骨版。Tripo 提供模型几何、配套贴图和两个人物的骨骼绑定；项目代码负责玩法、物理判定、场景摆放、镜头、动作驱动、资源优化及交互集成。

大厅星球、道路、建筑结构、其他程序物件与光照环境并非全部由 Tripo 生成，因此不使用「全部 3D 元素均由 Tripo 制作」的表述。

## 数量口径

| 口径 | 数量 | 依据 |
| --- | ---: | --- |
| 运行时注册项／发布模型脚本 | 20 | `src/tripo-assets.js`、`dist/src/tripo-data-*.js` |
| 注册项中直接对应 `text_to_model` 的输出 | 18 | 相应目录的 `tripo-result.json` |
| 注册项中对应 `animate_rig` 的输出 | 2 | `athlete-rig`、`rider-rig` |
| 当前作品使用的独立生成形象 | **19** | 18 个直接生成输出，加未单独注册的骑手原模；球手绑骨版不重复计数 |
| 当前作品的基础生成模型版本 | 1 个 P1 + 18 个 v3.1 | 记录值分别为 `P1-20260311`、`v3.1-20260211`；注册表将后者展示为 H 3.1 |
| 本地保存的全部成功文字生成记录 | 22 | 当前使用的 19 个，加 3 个未发布早期试作 |
| 本地保存的其他成功任务 | 2 次绑定 + 2 次可绑定检查 | `animate_rig`、`animate_prerigcheck`；检查不产生新的形象 |

不能将「18 个直接生成输出」写成全部生成形象数，也不能把「20 个运行时注册项」写成 20 个彼此独立的原创形象。

## 运行时模型清单

目录均位于 `artifacts/tripo/`。每行的 `game.glb` 与对应 `src/tripo-data-{id}.js` 解码结果一致，且该模型脚本在 `src/` 和 `dist/src/` 中字节一致。20 行的任务 ID、字节数均与 `manifest.json` 对齐。

| 注册 ID | 形象／使用位置 | 本地产物目录 | 输出任务 ID |
| --- | --- | --- | --- |
| `monster` | 薄荷小怪兽；敲敲小怪兽、记忆卡片 | `mint-monster` | `14122e63-361c-41c7-af3e-d46a86bc8430` |
| `athlete` | 球场旅人原模；记忆卡片 | `realistic-athlete` | `7048d89e-1352-46ee-94e1-76cd0af23900` |
| `player` | Tripo 3号球手；投篮角色及预览 | `athlete-rig` | `c87b7715-40e2-491a-9940-859869e6a91f`（绑定） |
| `motorcycle` | 疾风摩托；骑行车辆、预览与卡片 | `realistic-motorcycle` | `7885bf4e-3a36-4067-9ea6-831322094b5d` |
| `turtle` | 绿海龟；海底探索、预览与卡片 | `realistic-turtle` | `879af081-3ed9-4b60-9300-af8df4c359d9` |
| `coral` | 浅海珊瑚；海底、预览与卡片 | `realistic-coral` | `abde36af-92a8-444a-98f5-6122adef2925` |
| `manta` | 礁蝠鲼；海底探索 | `reef-manta` | `398f0a2d-c66f-4453-8d67-34fb8af307be` |
| `dolphin` | 宽吻海豚；海底探索 | `reef-dolphin` | `f815972b-1674-4954-97e3-db105519560a` |
| `clownfish` | 小丑鱼；海底鱼群 | `reef-clownfish` | `427e4bae-d7ef-416a-b53d-09e04da98c11` |
| `angelfish` | 皇帝神仙鱼；海底鱼群 | `reef-angelfish` | `9c370876-e1f0-46a3-91a1-f7dea0314388` |
| `seafan` | 红海扇；海底礁石花园 | `reef-seafan` | `9b7f7d3c-1b0b-451c-9aec-fd260b3cf188` |
| `tablecoral` | 桌形鹿角珊瑚；海底礁台 | `reef-tablecoral` | `b26bc06e-8a9a-4e52-8450-66b18360a861` |
| `anemone` | 锦绣海葵；海底花园 | `reef-anemone` | `f9da932b-9edb-4112-8f78-1e974897d1d7` |
| `sofa` | 亚麻沙发；拆家／楼体场景及卡片 | `realistic-sofa` | `e6feec2f-48c0-4ee4-842b-a5f317ca88fa` |
| `tv` | 薄屏电视；拆家／楼体场景及卡片 | `realistic-tv` | `5c905077-ea5e-4bd6-8c3f-bafe2a00ebc1` |
| `vase` | 陶瓷花瓶；拆家、预览与卡片 | `realistic-vase` | `25d5407d-b27c-4135-b9e3-f6c0c97512a9` |
| `car` | 银色跑车；压缩／楼体场景及卡片 | `realistic-car` | `450f1042-b1e9-4fde-8513-49752ebbab71` |
| `orange` | 阳光甜橙；切切乐、预览与卡片 | `realistic-orange` | `64814076-9471-4387-aca9-7a1212682ed1` |
| `pine` | 林间松树；场景植被与卡片 | `realistic-pine` | `f1b930d5-d5b1-4c13-8678-2a596746c2d2` |
| `rider` | Tripo 3号骑手；骑行角色与卡片 | `rider-rig` | `49c2a527-e037-4b9a-aca4-c59603d02663`（绑定） |

绑定关系以 `tripo-task.json` 的 `input` 和注册表 `generationTask` 双重核对：

- 球手：生成 `7048d89e-1352-46ee-94e1-76cd0af23900` → 绑定 `c87b7715-40e2-491a-9940-859869e6a91f`。
- 骑手：`realistic-rider` 中生成 `d15cd8fa-2160-4195-a441-7d0f3479b48c` → 绑定 `49c2a527-e037-4b9a-aca4-c59603d02663`。原模保存在本地，但没有独立运行时注册项。

未计入当前作品素材数量的早期试作：`basketball-player`（机器人，`9afe018d-1e8f-4718-9e68-bea74f9376c2`）、`television`（`5ed174b6-bb82-437d-8623-a723204b06fe`）、`vase`（`d64cbe4b-eab6-4483-bb86-01fdf9137d8a`）。它们不能与当前的 `player`、`tv`、`vase` 资源混淆。

## 生成与处理证据

1. 提示词保存在 `artifacts/tripo/*-prompt.txt` 或 `artifacts/tripo/prompts/*.txt`。本地 22 个文字生成任务的提示词均能与 `tripo-task.json` 的 `prompt_sha256` 对应，当前使用的 19 个也全部包含在内。
2. 结果记录均为 `status: success`；当前形象的基础任务类型为 `text_to_model`，不是导入外部参考照片的 `image_to_model` 记录。人物、车辆等提示词明确要求无品牌或无 logo，但该文字要求本身不构成法律权属或无侵权证明。
3. `model.glb` 为保存的生成／绑定产物；`scripts/prepare-tripo-assets.mjs` 将其内嵌贴图缩到不超过 2048 × 2048，并转成 quality 94 WebP，重写 GLB 缓冲后生成 `game.glb` 及本地 base64 脚本。模型不是网页上的截图占位。
4. 当前 20 个运行时 GLB 合计 **46,375,108 字节（约 44.23 MiB）**；每个有 3 个内嵌图像，绑定输出各有 1 个 skin。预检未发现外链图像／缓冲 URI。GLB 的 generator 字段为 Tripo 标识。
5. `src/hoops-tripo-character.js`、`src/ride-tripo-rider.js` 等程序负责骨骼姿态与动作驱动；实例复用、编号、朝向修正、碰撞与破坏逻辑不新增 Tripo 生成形象。卡片缩略图与海底拍摄照片由运行时场景渲染产生。
6. 实际外部运行时包导入只发现 `three` 及上述 Three.js addons；当前发布包的资源由本地脚本加载，没有将 Tripo 生成 API 用作游戏运行时依赖。

## 非 Tripo 内容与音频

| 类别 | 本地证据 | 提交说明的准确边界 |
| --- | --- | --- |
| 大厅星球、基础场景、程序角色及物件 | `planet-scene.js`、各 `*-scene.js`、`sport-avatar.js`、`crusher-models.js` | 由几何、材质、纹理生成代码构成；不能全部计为 Tripo 资产 |
| 摄影棚环境光 | `game-previews.js`、`memory-tripo-art.js` 引用 Three.js `RoomEnvironment` | 库内程序场景转成环境贴图；其上游来源是 Google EnvironmentScene |
| 图标、底纹、光标、旧版插画 | `ui.js`、`neon-art.js`、`planet.css`、`demolition.css`、`favicon.svg` | 项目内 SVG/CSS 定义；没有另附图标包、外部照片或图像文件。不仅凭代码位于本地就断言全部图形享有独占原创权利 |
| 记忆卡面、海底照片 | `memory-tripo-art.js`、`memory-game.js`、`dive-experience.js`、`dive-scene.js` | 从本地模型／场景生成 data URL；不是购买的照片素材 |
| 字体 | 各 CSS 的 `font-family` | 系统字体回退。出现 Inter、宋体、苹方、微软雅黑等字体名，不代表打包或获得其字体文件授权 |
| 篮球配乐及音效 | `hoops-music.js`、`hoops.js` | 代码定义八小节音符序列、振荡器及噪声，运行时合成；无录音或歌曲文件 |
| 呼吸及海底环境声 | `calm-audio.js`、`dive-audio.js` | 振荡器、滤波噪声、和弦及气泡音本地合成 |
| 骑行声音 | `ride-experience.js` 的 `createRideAudio` | 引擎、风声、碰撞与提示音由代码合成 |
| 记忆游戏声音 | `memory-game.js` 的音频实现 | 翻牌、配对、完成音由振荡器合成 |
| 切切乐、敲怪兽、拆家／爆破／压缩声音 | `release-audio.js` 及各 controller 的导入 | 共用短促打击音合成器；噪声缓冲由代码填充，并非音频采样文件 |
| 旧版自助内容 | `care-data.js`、`care-app.js`、`care.html` | 保留 NHS、WHO、NICE、国家卫生健康委资料链接；不列为团队独创理论或 Tripo 贡献 |

已检查的 `dist/` 有 131 个文件；独立媒体文件仅发现 `favicon.svg`，另有 20 个脚本内嵌 GLB。未发现独立 PNG/JPEG/HDR 图片、MP3/WAV/OGG 等录音、视频或 WOFF/TTF/OTF 字体文件，源码也未引用外部字体下载或音频解码输入。这是对当前发布材料的事实核验，不是对所有可能相似的图形／旋律作法律鉴定。

## 许可与提交前尚未闭合的材料

完整署名与许可证已整理到同目录 **`THIRD_PARTY_NOTICES.md`**。

1. **声明随发布包分发尚待父任务处理。** 当前 `dist/vendor/three/LICENSE` 是完整 Three.js MIT 文本，入口 bundle 也保留 Three.js 版权标记；但当前 dist 没有 Earcut ISC 原文，也没有 RoomEnvironment 上游 Google EnvironmentScene 的署名及 Apache-2.0 原文。本次已在 notices 补齐。现有 `scripts/build-static.mjs` 不复制 `docs/submission/`，因此仅把文档留在源码目录不能补齐公开 dist；父任务需将声明纳入实际提交／演示分发材料，并保留现有 MIT 文件。MIT、ISC 的原文均要求保留版权及许可声明；Apache-2.0 的再分发、修改标记等条件见其第 4 节。本次不修改打包脚本或 dist。
2. **Tripo 输出使用权益尚无本地凭据。** 本地有提示词、成功任务、任务 ID、credit 消耗与二进制，却没有生成账户当时适用的套餐／服务条款版本或独立输出授权记录。不能据此填写「已核实独占版权」「无限商用」或「所有模型均已法律确权」。如提交表单要求确认授权，应由生成账户使用者依据其实际适用权益确认；本次没有代替其作确认。

除此之外，本次没有发现需要另补第三方照片、录音采样或字体文件许可的已发布素材。

## 模型内容指纹

下列 SHA-256 对象是解码后的 **`game.glb` 字节**，不是较大的原始 `model.glb`，也不是外层 JavaScript 文本。`src` 与现有 `dist` 的同名脚本另已逐字节核对一致。

| ID | game.glb SHA-256 |
| --- | --- |
| monster | `415bf8a0aebeb3b47d098a8f5406fe1581f908d5ff7a40131cbad1ff0ae5354a` |
| athlete | `c2c97682012edc4adfabb5f90d7546f540d01252878e679266d8cc109077e44e` |
| player | `572d2067a2fea23b3a8e67c0210a11849d5de1b9f70ad81c824099dd325b04ad` |
| motorcycle | `c52d07833c90db5cb4bb2858613b8c9e7ff27121520146c50863dfcece4f2edb` |
| turtle | `b6fe102760635292c1366cbd3786308f6ca7002d273ddd1e1512a8cdaba96f9b` |
| coral | `96467230d066d1805bbdfb711d13dfce8c70a7df74b8fb196876d81c20459a32` |
| manta | `3484ea150263f4b7fb7d40efe6c7ab605a0cc68296772aa35338026f9dca9915` |
| dolphin | `6151cd4731064d7a381116cf45630fe458b9f4f2b763b1dbd787ff9094efdb3c` |
| clownfish | `7a10f5d8e37f5cb947cbc4e918f52eaff1d514ca32824398ad8a38eb911f338a` |
| angelfish | `d453f56fb412b12680521f7b2720802e115c0fd959e7729c0b78520a4799acf2` |
| seafan | `92f40f8a79c524c589b9b81f29d4a23bdc362393c13021547bbc236ca11624a1` |
| tablecoral | `16e925b5c64a8a58e17f78eeb0ad6aa825ef66b3514e9b6c3cfc2fa7dfdd66bf` |
| anemone | `8388b231bec3e04face88a6e4f67876749f5fdf4aa098cf20114c6c101a64ee6` |
| sofa | `9dc958a1d0b8b7f97840fa9024a4f267ca85cfcbebadf16d47eca76e2fe205ec` |
| tv | `b114567d1528f46c84e6bc23e27c927cbd1cf3910069529e99c310a1c950bdf4` |
| vase | `f23d14f9c3109c595f4361c4935e8bf06af8f9e6c33ae264c49c5857ca32f31a` |
| car | `4b5e998e999f2239085525dc889b7ad1c54e74fcef6a1a4d8d0187a471622fb1` |
| orange | `5ca16100379af027d9098ba7e4b76559f34b3782f516cc31025962ef538f40c9` |
| pine | `2f4e45479d7c6fb5a64b02ae1326d415b6bd7bdc077aaac33e2100581329f3c5` |
| rider | `309401636a69bd29e7b7e390502650ef89049f4503f201b16d664132b3d8be6d` |
