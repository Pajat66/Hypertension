// 血压录入页面
const app = getApp()

Page({
  data: {
    recognizedValue: '', // 识别的数值显示，如 "120/80"
    systolic: null,     // 收缩压（大压）
    diastolic: null,    // 舒张压（小压）
    isRecognizing: false,
    numbers: [],        // 存储识别的数字
    recognitionCount: 0, // 识别次数
    isComplete: false   // 是否录入完成
  },

  onLoad() {
    // 获取用户信息（从全局数据或存储中）
    this.userId = wx.getStorageSync('userId') || null
    
    // 初始化录音管理器
    this.recorderManager = wx.getRecorderManager()
    this.setupRecorderListeners()
    
    // 页面加载时自动触发语音识别
    this.startVoiceRecognition()
  },

  // 设置录音管理器监听器
  setupRecorderListeners() {
    this.recorderManager.onStart(() => {
      console.log('开始录音')
      wx.showToast({ 
        title: '正在聆听...', 
        icon: 'loading', 
        duration: 10000 
      })
    })

    this.recorderManager.onError((err) => {
      console.error('录音错误：', err)
      this.setData({ isRecognizing: false })
      wx.hideToast()
      wx.showToast({ title: '录音失败，请重试', icon: 'none' })
    })

    this.recorderManager.onStop((res) => {
      console.log('录音结束，开始识别')
      wx.hideToast()
      this.uploadAndRecognize(res.tempFilePath)
    })
  },

  onShow() {
    // 页面显示时执行
  },

  // 开始语音识别
  startVoiceRecognition() {
    this.setData({ 
      isRecognizing: true,
      numbers: [],
      recognizedValue: '',
      systolic: null,
      diastolic: null,
      isComplete: false
    })

    // 开始录音，最长10秒
    this.recorderManager.start({
      duration: 10000,
      sampleRate: 16000,
      numberOfChannels: 1,
      encodeBitRate: 96000,
      format: 'mp3',
      frameSize: 50
    })

    // 自动停止录音（避免无限录音）
    this.stopTimer = setTimeout(() => {
      if (this.data.isRecognizing) {
        this.recorderManager.stop()
      }
    }, 8000) // 8秒后自动停止
  },

  // 上传文件并进行语音识别
  uploadAndRecognize(tempFilePath) {
    wx.showLoading({ title: '识别中...', mask: true })
    
    // 获取API地址
    const apiBase = app.globalData.API_BASE
    
    wx.uploadFile({
      url: `${apiBase}/voice2text`,
      filePath: tempFilePath,
      name: 'file',
      success: (res) => {
        wx.hideLoading()
        try {
          const data = JSON.parse(res.data)
          console.log('识别结果：', data.text)
          
          if (data.text) {
            this.processRecognizedText(data.text)
          } else {
            this.setData({ isRecognizing: false })
            wx.showToast({ title: '未识别到内容，请重说', icon: 'none' })
          }
        } catch (e) {
          console.error('解析响应失败：', e)
          this.setData({ isRecognizing: false })
          wx.showToast({ title: '识别失败，请重试', icon: 'none' })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('上传失败：', err)
        this.setData({ isRecognizing: false })
        wx.showToast({ title: '网络错误，请重试', icon: 'none' })
      }
    })
  },

  // 处理识别的文本，提取数字
  processRecognizedText(text) {
    console.log('识别的文本：', text)
    
    // 提取所有数字
    const numbers = text.match(/\d+/g)
    
    if (!numbers || numbers.length === 0) {
      this.setData({ isRecognizing: false })
      wx.showToast({ title: '未识别到数字，请重说', icon: 'none' })
      return
    }

    // 合并已有的数字和新的数字
    let allNumbers = [...this.data.numbers]
    
    // 添加识别到的数字到数组中
    numbers.forEach(num => {
      const value = parseInt(num)
      // 收缩压和舒张压的合理范围
      if (value >= 50 && value <= 250) {
        if (!allNumbers.includes(value)) {
          allNumbers.push(value)
        }
      }
    })

    console.log('提取的数字：', allNumbers)

    // 检查是否已识别到两个数字
    if (allNumbers.length >= 2) {
      // 自动确认大的为大压，小的为小压
      const sortedNumbers = [...allNumbers].sort((a, b) => b - a)
      const systolic = sortedNumbers[0]
      const diastolic = sortedNumbers[1]
      
      // 验证数据合理性
      if (systolic >= diastolic && diastolic >= 40 && systolic <= 250) {
        this.setData({
          systolic: systolic,
          diastolic: diastolic,
          recognizedValue: `${systolic} ${diastolic}`,
          numbers: allNumbers,
          isComplete: true,
          isRecognizing: false
        })
        
        wx.showToast({ title: '识别完成', icon: 'success' })
      } else {
        this.setData({ isRecognizing: false })
        wx.showToast({ title: '血压值不合理，请重说', icon: 'none' })
      }
    } else if (allNumbers.length === 1 && this.data.numbers.length === 0) {
      // 只识别到一个数字，且这是第一次识别
      this.setData({
        recognizedValue: `${allNumbers[0]}`,
        numbers: allNumbers,
        isRecognizing: false
      })
      
      wx.showToast({ title: '听到第一个数字，请继续说', icon: 'none', duration: 2000 })
      
      // 自动开始第二次录音
      setTimeout(() => {
        this.startVoiceRecognition()
      }, 1500)
    } else {
      // 没有识别到有效数字
      this.setData({ isRecognizing: false })
      wx.showToast({ title: '未识别到有效数字，请重说', icon: 'none' })
    }
  },

  // 重说按钮点击事件
  onRetry() {
    // 停止可能正在进行的录音
    if (this.stopTimer) {
      clearTimeout(this.stopTimer)
    }
    this.recorderManager.stop()
    
    // 重新开始识别
    this.startVoiceRecognition()
  },

  // 保存按钮点击事件
  onSave() {
    if (!this.data.isComplete || !this.data.systolic || !this.data.diastolic) {
      wx.showToast({ title: '请完成血压录入', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })

    const apiBase = app.globalData.API_BASE

    // 调用后端API保存血压数据
    wx.request({
      url: `${apiBase}/save_measure`,
      method: 'POST',
      data: {
        text: `${this.data.systolic}/${this.data.diastolic}`, // 传给后端解析
        user_id: this.userId
      },
      success: (res) => {
        wx.hideLoading()
        console.log('保存成功：', res.data)
        
        if (res.data.ok) {
          wx.showToast({ 
            title: '保存成功', 
            icon: 'success',
            duration: 1500
          })
          
          // 保存成功后返回主页
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        } else {
          wx.showToast({ title: '保存失败', icon: 'none' })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('保存失败：', err)
        wx.showToast({ title: '网络错误，请重试', icon: 'none' })
      }
    })
  },

  // 返回按钮点击事件
  onBack() {
    wx.navigateBack()
  }
})