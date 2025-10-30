const wxCharts = require('../../utils/wx-charts.js');

Page({
  data: {
    isPlaying: false,
    innerAudioContext: null,
    patientName: '' // 新增：用于存储患者姓名
  },

  // 新增：页面加载时接收患者姓名参数
  onLoad(options) {
    // 从跳转链接中获取患者姓名（患者首页传递的参数）
    const patientName = decodeURIComponent(options.patientName || '');
    if (patientName) {
      this.setData({
        patientName: patientName // 赋值到数据中，页面会自动更新显示
      });
    }
  },

  onReady() {
    this.initBpChart();
    this.initAudioContext();
  },

  initAudioContext() {
    this.setData({
      innerAudioContext: wx.createInnerAudioContext()
    });
    this.data.innerAudioContext.src = `/audio/dialect_${this.data.patientName}.mp3`; // 可根据患者姓名加载对应语音
  },

  initBpChart() {
    const windowWidth = wx.getSystemInfoSync().windowWidth;
    const bpData = {
      dates: ['10/1', '10/2', '10/3', '10/4', '10/5', '10/6', '10/7'],
      high: [155, 150, 152, 148, 145, 142, 140],
      low: [95, 90, 92, 88, 85, 82, 80] // 修正舒张压数值（正常范围更合理）
    };

    new wxCharts({
      canvasId: 'bpChart',
      type: 'line',
      categories: bpData.dates,
      series: [
        { name: '收缩压', data: bpData.high, color: '#4285f4', lineWidth: 3 },
        { name: '舒张压', data: bpData.low, color: '#f57c00', lineWidth: 3 }
      ],
      yAxis: {
        title: '血压 (mmHg)',
        min: 60, // 调整最小值，更符合血压实际范围
        max: 180
      },
      width: windowWidth - 40,
      height: 500,
      legend: true
    });
  },

  goBack() {
    wx.navigateBack();
  },

  playDialect() {
    this.playVoice();
  },

  playVoice() {
    const { isPlaying, innerAudioContext } = this.data;
    if (isPlaying) {
      innerAudioContext.pause();
      this.setData({ isPlaying: false });
      wx.showToast({ title: '语音已暂停', icon: 'none' });
    } else {
      innerAudioContext.play();
      this.setData({ isPlaying: true });
      wx.showToast({ title: '正在播放方言解读...', icon: 'none' });
      
      innerAudioContext.onEnded(() => {
        this.setData({ isPlaying: false });
      });
    }
  },

  onUnload() {
    if (this.data.innerAudioContext) {
      this.data.innerAudioContext.destroy();
    }
  }
});