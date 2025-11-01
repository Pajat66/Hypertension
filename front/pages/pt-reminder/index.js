// 从配置文件导入
var config = require('../../config.js');
var request = config.request;
var apiBaseUrl = config.apiBaseUrl;

Page({
  data: {
    time: '',
    network: '',
    reminders: [],  // 原始提醒列表
    groupedReminders: [],  // 按日期分组的提醒列表
    currentAudio: null,
    userInfo: null,
    loading: false,
    offset: 0,
    hasMore: true,
    playingId: null,
    error: null,
    currentPage: 0,  // 当前显示的页数（日期分组）
    pageSize: 10  // 每页显示的提醒条数
  },

  onLoad: function() {
    var that = this;
    that.updateTime();
    
    // 获取网络状态
    wx.getNetworkType({
      success: function(res) {
        that.setData({ network: res.networkType.toUpperCase() });
      }
    });
    
    // 监听网络状态变化
    wx.onNetworkStatusChange(function(res) {
      that.setData({ network: res.networkType.toUpperCase() });
    });
    
    // 获取本地存储的用户信息
    var userInfo = wx.getStorageSync('userInfo');
    console.log('获取到的用户信息:', userInfo);
    
    // 详细验证用户信息
    if (!userInfo) {
      console.error('未找到用户信息');
      that.setData({ error: '未找到用户信息，请重新登录' });
      wx.navigateTo({ url: '/pages/pt-login/index' });
      return;
    }
    
    // 验证用户ID
    if (!userInfo.user_id) {
      console.error('用户ID无效:', userInfo);
      that.setData({ error: '用户信息不完整，请重新登录' });
      wx.navigateTo({ url: '/pages/pt-login/index' });
      return;
    }
    
    if (userInfo && userInfo.user_id) {
      that.setData({ userInfo: userInfo }, function() {
        that.fetchReminders();
      });
    } else {
      console.error('无效的用户信息:', userInfo);
      that.setData({ 
        error: '用户信息无效，请重新登录',
        loading: false 
      });
      wx.showModal({
        title: '提示',
        content: '请先登录后再查看提醒',
        showCancel: false,
        success: function() {
          wx.navigateTo({
            url: '/pages/pt-login/index'
          });
        }
      });
    }
  },

  onShow: function() {
    this.updateTime();
  },

  onUnload: function() {
    if (this.data.currentAudio) {
      this.data.currentAudio.stop();
    }
  },

  updateTime: function() {
    var now = new Date();
    var hours = now.getHours().toString().padStart(2, '0');
    var minutes = now.getMinutes().toString().padStart(2, '0');
    this.setData({ time: hours + ':' + minutes });
  },

  fetchReminders: function(refresh) {
    var that = this;
    if (!that.data.userInfo || that.data.loading || (!refresh && !that.data.hasMore)) {
      return;
    }

    var userId = that.data.userInfo.user_id;
    if (!userId) {
      console.error('用户ID无效:', that.data.userInfo);
      that.setData({ error: '用户信息无效，请重新登录' });
      return;
    }

    var offset = refresh ? 0 : that.data.offset;
    that.setData({ 
      loading: true, 
      error: null 
    });

    if (refresh) {
      wx.showNavigationBarLoading();
    }

    request({
      url: '/api/patients/' + userId + '/reminders',
      method: 'GET',
      data: {
        offset: offset,
        limit: 20,
        days: 30
      },
      hideError: true
    }).then(function(result) {
      console.log('获取到的提醒数据:', result);
      
      if (!result.reminders || !Array.isArray(result.reminders)) {
        console.error('提醒数据格式错误:', result);
        throw new Error('提醒数据格式错误');
      }
      
      // 安全地获取分页信息
      var pagination = result.pagination || {};
      var reminders = result.reminders || [];
      var newReminders = refresh ? reminders : that.data.reminders.concat(reminders);
      
      // 按日期分组
      var grouped = that.groupRemindersByDate(newReminders);
      
      that.setData({
        reminders: newReminders,
        groupedReminders: grouped,
        offset: offset + reminders.length,
        hasMore: pagination.has_more !== undefined ? pagination.has_more : false,
        error: null
      });
      
      console.log('更新后的数据:', {
        remindersCount: newReminders.length,
        groupedCount: grouped.length,
        offset: offset + reminders.length,
        hasMore: pagination.has_more
      });
    }).catch(function(error) {
      console.error('获取提醒失败:', error);
      that.setData({
        error: error.message || '获取提醒失败，请检查网络连接后重试'
      });
    }).finally(function() {
      that.setData({ loading: false });
      if (refresh) {
        wx.hideNavigationBarLoading();
        wx.stopPullDownRefresh();
      }
    });
  },

  playReminder: function(e) {
    var that = this;
    var reminder = e.currentTarget.dataset.reminder;
    console.log('准备播放的提醒:', reminder);
    
    if (!reminder || !reminder.audio_path) {
      console.error('提醒数据不完整:', reminder);
      wx.showToast({
        title: '无法播放提醒',
        icon: 'error'
      });
      return;
    }

    if (that.data.network === 'NONE') {
      wx.showToast({
        title: '无网络连接',
        icon: 'error'
      });
      return;
    }

    if (that.data.currentAudio) {
      that.data.currentAudio.stop();
      that.setData({ playingId: null });
    }

    wx.showLoading({ title: '加载中...' });
    
    var audioContext = wx.createInnerAudioContext();
    var audioUrl = apiBaseUrl + reminder.audio_path;
    console.log('音频URL:', audioUrl);
    
    audioContext.src = audioUrl;
    
    var timeout = setTimeout(function() {
      if (!that.data.playingId) {
        audioContext.stop();
        wx.hideLoading();
        wx.showToast({
          title: '加载超时，请重试',
          icon: 'error'
        });
      }
    }, 15000);
    
    audioContext.onCanplay(function() {
      clearTimeout(timeout);
      wx.hideLoading();
      that.setData({ playingId: reminder.id });
    });
    
    audioContext.onPlay(function() {
      console.log('开始播放音频');
      wx.showToast({ 
        title: '正在播放...', 
        icon: 'none',
        duration: 2000
      });
    });

    audioContext.onEnded(function() {
      console.log('音频播放完成');
      wx.showToast({ 
        title: '播放完成', 
        icon: 'success' 
      });
      that.setData({ playingId: null });
      that.updateReminderStatus(reminder.id);
    });

    audioContext.onError(function(err) {
      console.error('音频播放错误:', err);
      clearTimeout(timeout);
      wx.hideLoading();
      that.setData({ playingId: null });
      
      var errorMsg = '播放失败';
      if (err.errCode === 10002) {
        errorMsg = '网络错误，请重试';
      } else if (err.errCode === 10003) {
        errorMsg = '资源不存在';
      }
      
      wx.showToast({
        title: errorMsg,
        icon: 'error',
        duration: 3000
      });
    });

    that.setData({ currentAudio: audioContext });
    audioContext.play();
  },

  updateReminderStatus: function(reminderId) {
    var that = this;
    request({
      url: '/api/patients/reminder/' + reminderId + '/mark_listened',
      method: 'POST'
    }).then(function() {
      var reminders = that.data.reminders.map(function(item) {
        if (item.id === reminderId) {
          return Object.assign({}, item, { is_listened: true });
        }
        return item;
      });
      
      // 重新分组
      var grouped = that.groupRemindersByDate(reminders);
      
      that.setData({ 
        reminders: reminders,
        groupedReminders: grouped
      });
    }).catch(function(error) {
      console.error('更新提醒状态失败:', error);
    });
  },

  onBack: function() {
    if (this.data.currentAudio) {
      this.data.currentAudio.stop();
    }
    wx.navigateBack();
  },
  
  onPullDownRefresh: function() {
    var that = this;
    that.setData({
      offset: 0,
      hasMore: true
    }, function() {
      that.fetchReminders(true);
    });
  },
  
  onReachBottom: function() {
    if (!this.data.loading && this.data.hasMore) {
      this.fetchReminders();
    }
  },

  onRetry: function() {
    var that = this;
    that.setData({
      offset: 0,
      hasMore: true,
      error: null,
      reminders: [],
      groupedReminders: [],
      currentPage: 0
    }, function() {
      that.fetchReminders(true);
    });
  },

  // 按日期分组提醒
  groupRemindersByDate: function(reminders) {
    var grouped = {};
    var that = this;
    
    reminders.forEach(function(reminder) {
      var dateStr = that.getDateString(reminder.created_at);
      if (!grouped[dateStr]) {
        grouped[dateStr] = {
          date: dateStr,
          displayDate: that.formatDisplayDate(reminder.created_at),
          reminders: []
        };
      }
      grouped[dateStr].reminders.push(reminder);
    });
    
    // 转换为数组并按日期倒序排列
    var result = Object.values(grouped).sort(function(a, b) {
      return new Date(b.date) - new Date(a.date);
    });
    
    return result;
  },

  // 获取日期字符串（YYYY-MM-DD）
  getDateString: function(dateStr) {
    if (!dateStr) return '';
    // 处理格式 "2025-10-31 10:06:07"
    var parts = dateStr.split(' ');
    return parts[0] || '';
  },

  // 格式化显示日期
  formatDisplayDate: function(dateStr) {
    if (!dateStr) return '';
    var date = new Date(dateStr.replace(/-/g, '/'));
    var today = new Date();
    var yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // 重置时间部分，只比较日期
    today.setHours(0, 0, 0, 0);
    yesterday.setHours(0, 0, 0, 0);
    date.setHours(0, 0, 0, 0);
    
    if (date.getTime() === today.getTime()) {
      return '今天';
    } else if (date.getTime() === yesterday.getTime()) {
      return '昨天';
    } else {
      var month = date.getMonth() + 1;
      var day = date.getDate();
      var weekdays = ['日', '一', '二', '三', '四', '五', '六'];
      var weekday = weekdays[date.getDay()];
      return month + '月' + day + '日 星期' + weekday;
    }
  }
});
