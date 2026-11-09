# BMW-Store-CN

宝马 iDrive 7（MGU）车机的 14 个性能测试应用，全部中文界面。

从 [mgu Store](https://github.com/robertnisipeanu/mgu-store) 安装。这些应用在 Store 里
**由车机现场编译**——推代码即发，不需要打包发布。

---

## 一、这 14 个应用

**一句话**：用车辆自己的传感器做性能测试，画在车机屏幕上。

**解决问题**：原厂没有这些功能，手机应用只能靠 GPS —— 起步瞬间的加速度、1 英里助跑、
变速箱油温这些都测不到。这 14 个应用直接读车的传感器，精度不依赖定位。

| 应用 | 版本 | 做什么 |
|---|---|---|
| 弹射起步计时 `draggy` | 2.5.19 | 0-100、100-200、1/4 英里计时，速度曲线与分段成绩 |
| 制动测试 `brake_test` | 1.5.19 | 100-0 的制动距离与用时 |
| 换挡转速 `redline` | 1.15.0 | 转速表与换挡提示灯，支持 HUD |
| G 值仪表 `gforce` | 1.6.20 | 纵向与横向加速度圆盘 |
| 车辆仪表 `car_vitals` | 2.26.0 | 水温、油温、增压、电压等实时读数 |
| 虚拟马力机 `dyno` | 1.5.2 | 由加速度反推功率与扭矩曲线 |
| 暖机助手 `warmup` | 1.7.3 | 冷启动后的暖机进度与限值 |
| EDrive 助手 `edrive` | 2.8.3 | 电量、电耗、能量回收 |
| 保养信息 `service` | 1.5.0 | 保养周期与剩余里程 |
| 故障检测 `dtc_scanner` | 2.9.6 | 读取与清除故障码 |
| 实时数据 `live_data` | 1.0.8 | 自定义信号表格与曲线 |
| 引擎配置 `live_adjustments` | 0.8.1 | 部分编码项的就地调整 |
| 变速箱配置 `zf8hp` | 1.5.5 | 8HP 变速箱状态与油温 |
| 毁灭战士 `doom` | 1.7.19 | 游戏 |

**本仓库新增**

- **全中文界面** — 应用自己的代码一行没改。构建时把中文词表烘进产物
  （`kit/locale.json`），界面出来就是中文，上游更新也不用重做翻译
- **每 6 小时自动跟随上游** — 上游更新自动同步、验证、提交；
  两边都改过的文件停下等 review，不自动覆盖

---

## 二、目录结构

```
apps/                       14 个应用，结构相同
  <id>/app.json             应用描述、页面与设置项定义
  <id>/main.js              主逻辑
  <id>/icon.png             图标

kit/                        构建系统（来自上游）
  tools/build.py            打包入口（--language zh-CN 出中文版）
  tools/test_*.js           各应用的测试
  runtime/                  共享运行时
  platform/                 平台适配
  localization/             翻译表

tools/sync-upstream.js      跟随上游
mgu-repo.json               Store 的仓库描述（构建参数在这里）
```

---

## 三、构建与测试

需要 Python 3。

```bash
python kit/tools/build.py --preview-only draggy      # 离线预览，不需要 BMW SDK
python kit/tools/build.py draggy --language zh-CN    # 中文包，需要 oap-sdk
node kit/tools/test_draggy.js                        # 它的测试
```

`oap-sdk` 是 BMW 的 SDK，**不能提交**（见 `.gitignore`）。从自己的车机上用
`kit/tools/extract_sdk.js` 提取。

全部 14 个应用的测试：

```bash
for t in kit/tools/test_*.js; do node "$t" || echo "FAIL $t"; done
```

CI（`.github/workflows/sync-upstream.yml`）在每次同步后跑同样的两步：
全部测试 + 14 个应用的中文构建。

---

## 四、来源与许可

本仓库 fork 自 [robertnisipeanu/idrive-apps](https://github.com/robertnisipeanu/idrive-apps)，
原作者 Robert Nisipeanu。

这 14 个应用与 `kit/` 来自
[cauliflowermossgrape/idrive7-apps](https://github.com/cauliflowermossgrape/idrive7-apps)，
本仓库只加中文，代码不改。

GPL-3.0-or-later。
