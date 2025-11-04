const wxCharts = require('../../utils/wx-charts.js');
const app = getApp()

Page({
  data: {
    patientId: null,
    patientName: '',
    analysisText: '', // 趋势分析文本
    loading: false,
    chart: null
  },

  onLoad(options) {
    // 从URL参数获取患者ID和姓名
    const patientId = options.patientId ? parseInt(options.patientId) : null
    const patientName = decodeURIComponent(options.patientName || '')
    
    if (!patientId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({
      patientId: patientId,
      patientName: patientName
    })

    // 加载血压数据和趋势分析
    this.loadBpRecords()
    this.loadBpAnalysis()
  },

  onReady() {
    // 图表初始化在数据加载完成后进行
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
          // 处理血压数据并绘制图表
          this.initBpChart(res.data)
        } else {
          // 没有数据时显示空图表
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
    
    // 如果没有数据，显示空图表
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

    // 按时间正序排列（最早的在前面）
    const sortedRecords = [...records].sort((a, b) => {
      const dateA = new Date(a.measured_at || a.created_at || 0)
      const dateB = new Date(b.measured_at || b.created_at || 0)
      return dateA - dateB
    })

    // 提取日期和血压值
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

    // 计算Y轴范围
    const allValues = [...systolicData, ...diastolicData].filter(v => v > 0)
    const minValue = allValues.length > 0 ? Math.max(60, Math.min(...allValues) - 20) : 60
    const maxValue = allValues.length > 0 ? Math.min(200, Math.max(...allValues) + 20) : 180

    // 如果只有一条数据，添加一个虚拟点以显示图表
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
        }
      },
      fail: (err) => {
        console.error('加载趋势分析失败：', err)
      }
    })
  },

  // 输入趋势分析文本
  onAnalysisInput(e) {
    this.setData({
      analysisText: e.detail.value
    })
  },

  // 保存趋势分析
  saveAnalysis() {
    const { patientId, analysisText } = this.data
    
    if (!patientId) {
      wx.showToast({ title: '参数错误', icon: 'none' })
      return
    }

    if (!analysisText.trim()) {
      wx.showToast({ title: '请输入趋势分析', icon: 'none' })
      return
    }

    // 获取医生ID
    let doctorId = wx.getStorageSync('doctorId')
    if (!doctorId) {
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo && userInfo.worker_id) {
        doctorId = userInfo.worker_id
      }
    }

    if (!doctorId) {
      wx.showToast({ title: '未找到医生信息', icon: 'none' })
      return
    }

    const apiBase = app.globalData.API_BASE
    wx.showLoading({ title: '保存中...', mask: true })

    wx.request({
      url: `${apiBase}/api/patients/${patientId}/bp_analysis`,
      method: 'POST',
      header: {
        'Content-Type': 'application/json'
      },
      data: {
        analysis_text: analysisText.trim(),
        worker_id: doctorId
      },
      success: (res) => {
        wx.hideLoading()
        if (res.data.ok) {
          wx.showToast({ title: '保存成功', icon: 'success' })
        } else {
          wx.showToast({ title: res.data.error || '保存失败', icon: 'none' })
        }
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('保存趋势分析失败：', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
      }
    })
  },

  goBack() {
    wx.navigateBack()
  }
})