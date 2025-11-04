const wxCharts = require('../../utils/wx-charts.js');
const app = getApp()

Page({
  data: {
    patientId: null,
    patientName: '',
    analysisText: '', // 医生写的趋势分析
    isPlaying: false,
    innerAudioContext: null,
    audioUrl: null, // TTS生成的音频URL
    chart: null
  },

  onLoad() {
    // 获取患者ID和姓名
    let patientId = wx.getStorageSync('userId')
    const userInfo = wx.getStorageSync('userInfo') || {}
    
    if (!patientId && userInfo.user_id) {
      patientId = userInfo.user_id
      wx.setStorageSync('userId', patientId)
    }

    const patientName = userInfo.name || userInfo.username || ''

    if (!patientId) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({
      patientId: patientId,
      patientName: patientName
    })

    // 初始化音频上下文
    this.initAudioContext()

    // 加载血压数据和趋势分析
    this.loadBpRecords()
    this.loadBpAnalysis()
  },

  onReady() {
    // 图表初始化在数据加载完成后进行
  },

  initAudioContext() {
    this.setData({
      innerAudioContext: wx.createInnerAudioContext()
    })
  },

  // 加载血压记录
  loadBpRecords() {
    const { patientId } = this.data
    if (!patientId) return

    const apiBase = app.globalData.API_BASE
    wx.request({
      url: `${apiBase}/api/patients/${patientId}/bp_records`,
      method: 'GET',
      success: (res) => {
        if (Array.isArray(res.data) && res.data.length > 0) {
          this.initBpChart(res.data)
        } else {
          this.initBpChart([])
          wx.showToast({ title: '暂无血压记录', icon: 'none' })
        }
      },
      fail: (err) => {
        console.error('加载血压记录失败：', err)
        wx.showToast({ title: '加载失败', icon: 'none' })
        this.initBpChart([])
      }
    })
  },

  // 初始化血压图表
  initBpChart(records) {
    const windowWidth = wx.getSystemInfoSync().windowWidth
    
    if (!records || records.length === 0) {
      new wxCharts({
        canvasId: 'bpChart',
        type: 'line',
        categories: ['暂无数据'],
        series: [
          { name: '收缩压', data: [0], color: '#4285f4', lineWidth: 3 },
          { name: '舒张压', data: [0], color: '#f57c00', lineWidth: 3 }
        ],
        yAxis: {
          title: '血压 (mmHg)',
          min: 60,
          max: 180
        },
        width: windowWidth - 40,
        height: 500,
        legend: true
      })
      return
    }

    // 按时间正序排列
    const sortedRecords = [...records].sort((a, b) => {
      const dateA = new Date(a.measured_at || a.created_at || 0)
      const dateB = new Date(b.measured_at || b.created_at || 0)
      return dateA - dateB
    })

    const dates = []
    const systolicData = []
    const diastolicData = []

    sortedRecords.forEach(record => {
      if (record.measured_at) {
        const date = new Date(record.measured_at)
        const month = date.getMonth() + 1
        const day = date.getDate()
        dates.push(`${month}/${day}`)
      } else if (record.created_at) {
        const date = new Date(record.created_at)
        const month = date.getMonth() + 1
        const day = date.getDate()
        dates.push(`${month}/${day}`)
      } else {
        dates.push('')
      }

      systolicData.push(record.systolic || 0)
      diastolicData.push(record.diastolic || 0)
    })

    const allValues = [...systolicData, ...diastolicData].filter(v => v > 0)
    const minValue = allValues.length > 0 ? Math.max(60, Math.min(...allValues) - 20) : 60
    const maxValue = allValues.length > 0 ? Math.min(200, Math.max(...allValues) + 20) : 180

    if (dates.length === 1) {
      dates.push(dates[0])
      systolicData.push(systolicData[0])
      diastolicData.push(diastolicData[0])
    }

    this.chart = new wxCharts({
      canvasId: 'bpChart',
      type: 'line',
      categories: dates,
      series: [
        { name: '收缩压', data: systolicData, color: '#4285f4', lineWidth: 3 },
        { name: '舒张压', data: diastolicData, color: '#f57c00', lineWidth: 3 }
      ],
      yAxis: {
        title: '血压 (mmHg)',
        min: minValue,
        max: maxValue
      },
      width: windowWidth - 40,
      height: 500,
      legend: true
    })
  },

  // 加载血压趋势分析
  loadBpAnalysis() {
    const { patientId } = this.data
    if (!patientId) return

    const apiBase = app.globalData.API_BASE
    wx.request({
      url: `${apiBase}/api/patients/${patientId}/bp_analysis`,
      method: 'GET',
      success: (res) => {
        if (res.data.ok && res.data.analysis) {
          this.setData({
            analysisText: res.data.analysis.analysis_text || ''
          })
        } else {
          this.setData({
            analysisText: ''
          })
        }
      },
      fail: (err) => {
        console.error('加载趋势分析失败：', err)
        this.setData({
          analysisText: ''
        })
      }
    })
  },

  // 播放方言解读
  playDialect() {
    const { analysisText, audioUrl, isPlaying } = this.data

    if (!analysisText || !analysisText.trim()) {
      wx.showToast({ title: '暂无医生分析', icon: 'none' })
      return
    }

    if (isPlaying) {
      // 暂停播放
      if (this.data.innerAudioContext) {
        this.data.innerAudioContext.pause()
        this.setData({ isPlaying: false })
        wx.showToast({ title: '已暂停', icon: 'none' })
      }
      return
    }

    // 如果已有音频URL，直接播放
    if (audioUrl) {
      this.playAudio(audioUrl)
      return
    }

    // 调用TTS API生成语音
    this.generateTTS(analysisText)
  },

  // 生成TTS语音
  generateTTS(text) {
    if (!text || !text.trim()) {
      wx.showToast({ title: '文本为空', icon: 'none' })
      return
    }

    wx.showLoading({ title: '生成语音中...', mask: true })
    const apiBase = app.globalData.API_BASE

    wx.request({
      url: `${apiBase}/api/speak`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        text: text
      },
      success: (res) => {
        wx.hideLoading()
        if (res.data.audio_url) {
          const audioUrl = `${apiBase}${res.data.audio_url}`
          this.setData({ audioUrl })
          this.playAudio(audioUrl)
        } else {
          wx.showToast({ title: '生成语音失败', icon: 'none' })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('TTS请求失败：', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
      }
    })
  },

  // 播放音频
  playAudio(audioUrl) {
    const { innerAudioContext } = this.data
    if (!innerAudioContext) return

    innerAudioContext.src = audioUrl
    innerAudioContext.play()
    this.setData({ isPlaying: true })
    wx.showToast({ title: '正在播放...', icon: 'none' })

    innerAudioContext.onEnded(() => {
      this.setData({ isPlaying: false })
    })

    innerAudioContext.onError((err) => {
      console.error('音频播放错误：', err)
      this.setData({ isPlaying: false })
      wx.showToast({ title: '播放失败', icon: 'none' })
    })
  },

  goBack() {
    wx.navigateBack()
  },

  onUnload() {
    if (this.data.innerAudioContext) {
      this.data.innerAudioContext.destroy()
    }
  }
})