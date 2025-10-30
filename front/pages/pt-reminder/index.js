// 听提醒页面
Page({
  data: {
    time: '',
    network: '5G',
    hasListened: false,
    reminderContent: '记得今天量血压'
  },

  onLoad() {
    // 设置当前时间
    this.updateTime();
  },

  onShow() {
    // 页面显示时更新时间
    this.updateTime();
  },

  updateTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    this.setData({ time: `${hours}:${minutes}` });
  },

  // 播放提醒语音
  playReminder() {
    // 模拟语音播放
    wx.showToast({ 
      title: '正在播放提醒...', 
      icon: 'none',
      duration: 2000
    });
    
    // 标记为已听
    this.setData({ hasListened: true });
    
    // 在实际应用中，这里应该调用微信小程序的语音播放API
    // const innerAudioContext = wx.createInnerAudioContext();
    // innerAudioContext.src = 'path/to/audio.mp3';
    // innerAudioContext.play();
    // innerAudioContext.onEnded(() => {
    //   wx.showToast({ title: '播放完毕', icon: 'none' });
    // });
  },

  // 返回按钮点击事件
  onBack() {
    wx.navigateBack();
  }
});