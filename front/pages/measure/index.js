Page({
  data: {
    isRecording: false,
    resultText: ""
  },

  recorderManager: null,

  onLoad() {
    // 初始化录音管理器
    this.recorderManager = wx.getRecorderManager()

    // 录音完成回调：上传文件 -> 后端返回 JSON -> 展示文本
    this.recorderManager.onStop(res => {
      console.log("录音停止，临时文件：", res.tempFilePath)
      wx.uploadFile({
        url: getApp().globalData.API_BASE + "/voice2text",
        filePath: res.tempFilePath,
        name: "file",
        success: r => {
          console.log("uploadFile 返回:", r.data)
          // 有些情况下 r.data 已经是对象；多数情况是字符串，安全起见做解析兜底
          try {
            const data = typeof r.data === "string" ? JSON.parse(r.data) : r.data
            this.setData({ resultText: data.text || "未识别出内容" })
          } catch (e) {
            console.error("解析失败:", e, r.data)
            wx.showToast({ title: "返回不是JSON", icon: "error" })
          }
        },
        fail: err => {
          wx.showToast({ title: "上传失败", icon: "error" })
          console.error(err)
        }
      })
    })

    // 录音错误兜底
    this.recorderManager.onError(err => {
      console.error("录音错误：", err)
      wx.showToast({ title: "录音失败", icon: "error" })
      this.setData({ isRecording: false })
    })
  },

  // 点击按钮：开始/停止录音
  toggleRecord() {
    if (this.data.isRecording) {
      // 停止
      this.recorderManager.stop()
      this.setData({ isRecording: false })
    } else {
      // 先请求权限
      wx.authorize({
        scope: "scope.record",
        success: () => {
          // 开始录音（参数尽量完整，安卓更稳）
          this.recorderManager.start({
            duration: 60000,       // 最长 60 秒
            sampleRate: 16000,     // 采样率
            numberOfChannels: 1,   // 单声道
            encodeBitRate: 96000,  // 编码码率
            format: "mp3",         // mp3/wav/aac...
            frameSize: 50          // KB
          })
          this.setData({ isRecording: true })
        },
        fail: () => {
          wx.showModal({
            title: "提示",
            content: "需要麦克风权限，请在系统设置中打开微信的麦克风权限",
            showCancel: false
          })
        }
      })
    }
  },

  // “不对重新说”
  retry() {
    this.setData({ resultText: "" })
  },

  // “对”
  confirm() {
    wx.showToast({ title: "确认内容：" + this.data.resultText, icon: "none" })
  },

  // “保存” -> 简单入库（后台把它挂到一个患者下）
  save() {
    wx.request({
      url: getApp().globalData.API_BASE + "/save_measure",
      method: "POST",
      data: { text: this.data.resultText },
      success: (res) => {
        console.log("save_measure 返回：", res.data)
        wx.showToast({ title: "已保存", icon: "success" })
      },
      fail: () => wx.showToast({ title: "保存失败", icon: "error" })
    })
  },

  // “提交1/2” -> 语音播报
  speakSubmit(e) {
    const text = e?.currentTarget?.dataset?.text || "提交成功"
    wx.request({
      url: getApp().globalData.API_BASE + "/speak",
      method: "POST",
      data: { text },
      success: res => {
        const base = getApp().globalData.API_BASE.replace("/api", "")
        const url = (res.data && res.data.audio_url) ? (base + res.data.audio_url) : ""
        if (!url) {
          wx.showToast({ title: "音频地址无效", icon: "error" })
          return
        }
        const audio = wx.createInnerAudioContext()
        audio.autoplay = true
        audio.src = url
        audio.onPlay(() => console.log("播放开始：", url))
        audio.onError(err => {
          console.error("播放失败：", err)
          wx.showToast({ title: "播放失败", icon: "error" })
        })
      },
      fail: () => wx.showToast({ title: "语音播报失败", icon: "error" })
    })
  }
})
