Page({
  data: {
    selectedPatients: '',  // 选中的患者类型：'all', 'noRecord', 'abnormal'
    selectedContent: '明天来测血压',   // 选中的提醒内容，默认选中第一项
    customContent: '',     // 自定义提醒内容
    showCustomInput: false, // 是否显示自定义输入框
    doctorInfo: null, // 存储医生信息
    defaultContents: [
      { id: 1, text: '明天来测血压', checked: true },
      { id: 2, text: '该买降压药了', checked: false },
      { id: 3, text: '注意身体，血压波动大', checked: false }
    ]
  },

  onLoad() {
    this.getDoctorInfo();
  },

  onShow() {
    // 每次页面显示时都重新获取医生信息
    this.getDoctorInfo();
  },

  // 获取医生信息
  getDoctorInfo() {
    try {
      const doctorInfo = wx.getStorageSync('userInfo');
      console.log('获取到的医生信息：', doctorInfo);
      
      // 确保是医生信息
      if (doctorInfo && doctorInfo.phone && doctorInfo.name) {
        this.setData({ 
          doctorInfo: {
            ...doctorInfo,
            id: doctorInfo.worker_id || doctorInfo.id // 确保有id字段
          }
        });

        // 如果没有村庄信息，获取医生完整信息
        if (!doctorInfo.village) {
          this.fetchDoctorDetails(doctorInfo.id || doctorInfo.worker_id);
        }
      } else {
        console.log('未找到有效的医生信息');
      }
    } catch (error) {
      console.error('获取医生信息错误:', error);
    }
  },

  // 获取医生的完整信息
  async fetchDoctorDetails(doctorId) {
    try {
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: `http://192.168.150.117:5000/api/doctors/${doctorId}`,
          method: 'GET',
          success: resolve,
          fail: reject
        });
      });

      if (res.statusCode === 200 && res.data.doctor) {
        const updatedDoctorInfo = {
          ...this.data.doctorInfo,
          ...res.data.doctor
        };
        this.setData({ doctorInfo: updatedDoctorInfo });
        
        // 更新存储的信息
        wx.setStorageSync('userInfo', updatedDoctorInfo);
      }
    } catch (error) {
      console.error('获取医生详细信息失败:', error);
    }
  },

  goBack() {
    wx.navigateBack();
  },

  // 选择患者类型
  selectPatientType(e) {
    const type = e.currentTarget.dataset.type;
    console.log('选择患者类型:', type);
    this.setData({ 
      selectedPatients: type 
    }, () => {
      wx.showToast({
        title: '已选择' + (type === 'all' ? '全部患者' : type === 'noRecord' ? '未记录血压患者' : '血压异常患者'),
        icon: 'none'
      });
    });
  },

  // 选择提醒内容
  selectRemindContent(e) {
    const index = parseInt(e.currentTarget.dataset.index);
    console.log('选择提醒内容，索引:', index);
    
    // 更新选中状态
    const defaultContents = this.data.defaultContents.map((item, idx) => ({
      ...item,
      checked: idx === index
    }));
    
    // 获取选中的内容
    const selectedContent = this.data.defaultContents[index].text;
    console.log('选中的内容:', selectedContent);
    
    this.setData({ 
      defaultContents,
      selectedContent,
      showCustomInput: false,
      customContent: ''
    }, () => {
      console.log('更新后的状态:', {
        selectedContent: this.data.selectedContent,
        defaultContents: this.data.defaultContents
      });
      wx.showToast({
        title: '已选择：' + selectedContent,
        icon: 'none'
      });
    });
  },

  // 显示自定义输入框
  showCustomInput() {
    // 取消所有预设内容的选中状态
    const defaultContents = this.data.defaultContents.map(item => ({
      ...item,
      checked: false
    }));
    
    this.setData({ 
      showCustomInput: true,
      defaultContents,
      selectedContent: '', // 清空选中的预设内容
      customContent: ''  // 清空自定义内容
    }, () => {
      wx.showToast({
        title: '请输入自定义内容',
        icon: 'none'
      });
    });
  },

  // 监听自定义内容输入
  onCustomInput(e) {
    const value = e.detail.value;
    console.log('输入自定义内容:', value);
    
    this.setData({
      customContent: value,
      selectedContent: value  // 将自定义内容也设置为选中的内容
    }, () => {
      console.log('更新后的状态:', {
        customContent: this.data.customContent,
        selectedContent: this.data.selectedContent
      });
    });
  },

  // 预览语音
  previewAudio(e) {
    const content = e.currentTarget.dataset.content;
    // 调用后端TTS接口将文字转换为语音
    wx.request({
      url: 'YOUR_BACKEND_API/tts',
      method: 'POST',
      data: {
        text: content
      },
      success: (res) => {
        // 创建音频实例并播放
        const innerAudioContext = wx.createInnerAudioContext();
        innerAudioContext.src = res.data.audioUrl;
        innerAudioContext.play();
      }
    });
  },

  // 发送提醒
  async sendRemind() {
    console.log('当前选择状态:', {
      selectedPatients: this.data.selectedPatients,
      selectedContent: this.data.selectedContent,
      customContent: this.data.customContent,
      doctorInfo: this.data.doctorInfo
    });

    if (!this.data.selectedPatients) {
      wx.showToast({
        title: '请选择提醒对象',
        icon: 'none'
      });
      return;
    }

    // 确定最终要发送的内容
    let finalContent = '';
    if (this.data.showCustomInput) {
      if (!this.data.customContent.trim()) {
        wx.showToast({
          title: '请输入提醒内容',
          icon: 'none'
        });
        return;
      }
      finalContent = this.data.customContent.trim();
    } else {
      // 检查是否有选中的内容
      const selectedItem = this.data.defaultContents.find(item => item.checked);
      if (!selectedItem) {
        wx.showToast({
          title: '请选择提醒内容',
          icon: 'none'
        });
        return;
      }
      finalContent = selectedItem.text;
    }

    console.log('准备发送的内容:', finalContent);

    // 重新获取一次医生信息
    this.getDoctorInfo();
    
    if (!this.data.doctorInfo) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      return;
    }

    try {
      wx.showLoading({ title: '发送中...' });
      
      // 调用后端接口发送提醒
      const res = await new Promise((resolve, reject) => {
        wx.request({
          url: 'http://192.168.150.117:5000/api/doctor/reminders',
          method: 'POST',
          data: {
            doctor_id: this.data.doctorInfo.id, // 改用统一的id字段
            target_type: this.data.selectedPatients,
            content: finalContent
          },
          success: resolve,
          fail: reject
        });
      });

      if (res.statusCode === 200 && res.data.ok) {
        wx.hideLoading();
        const successMsg = res.data.affected_patients 
          ? `发送成功，已发送给${res.data.affected_patients}名患者` 
          : '发送成功';
        wx.showToast({
          title: successMsg,
          icon: 'success',
          duration: 2000
        });

        // 如果有部分失败，显示警告
        if (res.data.failed_count > 0) {
          setTimeout(() => {
            wx.showToast({
              title: `${res.data.failed_count}个患者发送失败`,
              icon: 'none',
              duration: 3000
            });
          }, 2200);
        }

        // 重置选择状态
        this.setData({
          selectedContent: '',
          customContent: '',
          showCustomInput: false,
          defaultContents: this.data.defaultContents.map(item => ({
            ...item,
            checked: false
          }))
        });
      } else {
        const errorMsg = res.data.error || res.data.detail || '发送失败';
        console.error('发送提醒失败:', {
          statusCode: res.statusCode,
          error: res.data.error,
          detail: res.data.detail,
          allErrors: res.data.all_errors
        });
        throw new Error(errorMsg);
      }
    } catch (error) {
      console.error('发送提醒失败:', error);
      wx.hideLoading();
      const errorMessage = error.message || '发送失败，请稍后重试';
      wx.showToast({
        title: errorMessage.length > 20 ? errorMessage.substring(0, 20) + '...' : errorMessage,
        icon: 'error',
        duration: 3000
      });
    }
  }
})