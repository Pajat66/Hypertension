// pages/index/index.js
Page({
  onLoad() {
    console.log('index onLoad');
  },

  gotoPatient() {
    console.log('gotoPatient called');
    wx.navigateTo({
      url:'/pages/pt-login/index',
      success() { console.log('navigateTo pt-login success'); },
      fail(err) { console.error('navigateTo pt-login fail', err); }
    });
  },

  gotoDoctor() {
    console.log('gotoDoctor called');
    wx.navigateTo({
      url: '/pages/login/login',
      success() { console.log('navigateTo login success'); },
      fail(err) { console.error('navigateTo login fail', err); }
    });
  }
});
