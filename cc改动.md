# CC 改动记录

## stage-pocket 手机端修复（2026-04-16）

### 必须修

#### 1. Android 麦克风权限
**文件：** `apps/stage-pocket/android/app/src/main/AndroidManifest.xml`

新增两条权限声明：
```xml
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
```
原来只有 `INTERNET`，导致 Android 上 VAD 和语音转写完全无法运行。

---

#### 2. iOS 麦克风使用说明
**文件：** `apps/stage-pocket/ios/App/App/Info.plist`

新增：
```xml
<key>NSMicrophoneUsageDescription</key>
<string>AIRI needs microphone access to hear you speak.</string>
```
iOS 强制要求此字段，缺少会在运行时 crash，App Store 审核也会拒绝。

---

#### 3. Characters 设置页（移植至 stage-pages）
**新增文件：**
- `packages/stage-pages/src/pages/settings/characters/index.vue`
- `packages/stage-pages/src/pages/settings/characters/components/CharacterItem.vue`
- `packages/stage-pages/src/pages/settings/characters/components/CharacterDialog.vue`

**修改文件：**
- `packages/i18n/src/locales/en/settings.yaml` — 新增 `pages.characters.title/description`
- `packages/i18n/src/locales/zh-Hans/settings.yaml` — 新增中文对应翻译

从 `apps/stage-web` 移植角色管理页到 `packages/stage-pages`，使手机端可以通过 `/settings/characters` 管理 AI 角色定义（需连接到桌面端 AIRI 服务器）。页面通过 `settingsEntry: true` 自动出现在设置列表中（order: 3）。

---

### 重要

#### 4. iOS 后台音频
**文件：** `apps/stage-pocket/ios/App/App/Info.plist`

新增：
```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

**文件：** `apps/stage-pocket/ios/App/App/AppDelegate.swift`

新增 `import AVFoundation` 并在 `didFinishLaunchingWithOptions` 里配置音频会话：
```swift
try AVAudioSession.sharedInstance().setCategory(
    .playAndRecord,
    mode: .default,
    options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers]
)
try AVAudioSession.sharedInstance().setActive(true)
```
修复切后台时 TTS 语音被系统静音的问题。

---

#### 5. Onboarding 麦克风权限请求
**文件：** `apps/stage-pocket/src/components/onboarding/step-permissions.vue`

原来只有通知权限一项。新增麦克风授权步骤（排在通知之前）：
- 调用 `navigator.mediaDevices.getUserMedia({ audio: true })` 触发系统授权弹窗
- 授权成功显示绿色对勾，失败显示红色叉并跳转系统设置
- 新增 `requestMicrophonePermission` 函数和 `microphonePermissionGranted` 状态

---

#### 6. Splash Screen
**文件：** `pnpm-workspace.yaml`

catalog 新增：
```yaml
'@capacitor/splash-screen': ^6.0.0
```

**文件：** `apps/stage-pocket/package.json`

dependencies 新增：
```json
"@capacitor/splash-screen": "catalog:"
```

**文件：** `apps/stage-pocket/capacitor.config.ts`

新增插件配置：
```ts
plugins: {
  SplashScreen: {
    launchShowDuration: 1500,
    launchAutoHide: true,
    backgroundColor: '#0f0f0f',
    androidSplashResourceName: 'splash',
    androidScaleType: 'CENTER_CROP',
    showSpinner: false,
    splashFullScreen: true,
    splashImmersive: true,
  },
},
```
启动画面使用已有的 `resources/splash.png`，黑色背景，1.5 秒后自动隐藏。

> **需要手动执行：** `pnpm install && npx cap sync` 让原生端同步新依赖。
