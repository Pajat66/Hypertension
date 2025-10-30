const wxCharts = require('../../utils/wx-charts.js');

Page({
  data: {
    isPlaying: false,
    innerAudioContext: null
  },

  onReady() {
    this.initBpChart();
    this.initAudioContext();
  },

  initAudioContext() {
    this.setData({
      innerAudioContext: wx.createInnerAudioContext()
    });
    // 替换为实际方言语音文件路径（示例路径，需根据项目调整）
    this.data.innerAudioContext.src = '/audio/general_dialect.mp3';
  },

  initBpChart() {
    const windowWidth = wx.getSystemInfoSync().windowWidth;
    const bpData = {
      dates: ['10/1', '10/2', '10/3', '10/4', '10/5', '10/6', '10/7'],
      high: [155, 150, 152, 148, 145, 142, 140],
      low: [250, 240, 245, 235, 230, 225, 220]
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
        min: 0,
        max: 300
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