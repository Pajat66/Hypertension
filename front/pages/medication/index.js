// 我的用药页面
Page({
  data: {
    time: '',
    network: '5G',
    medications: [
      {
        id: '1',
        name: '氨氯地平',
        time: '早饭前',
        dosage: '1片/次',
        isTaken: false
      },
      {
        id: '2',
        name: '缬沙坦',
        time: '早饭后',
        dosage: '1片/次',
        isTaken: false
      },
      {
        id: '3',
        name: '非洛地平缓释片',
        time: '晚饭前',
        dosage: '1片/次',
        isTaken: false
      },
      {
        id: '4',
        name: '依那普利',
        time: '晚饭后',
        dosage: '1片/次',
        isTaken: false
      }
    ]
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

  // 双击检测变量
  lastTapTime: 0,
  lastTapId: '',
  
  // 切换药品服用状态（处理单击和双击）
  toggleMedicationStatus(e) {
    const id = e.currentTarget.dataset.id;
    const currentTime = new Date().getTime();
    const lastTapTime = this.lastTapTime;
    const lastTapId = this.lastTapId;
    
    // 更新最后点击时间和ID
    this.lastTapTime = currentTime;
    this.lastTapId = id;
    
    // 判断是否为双击：同一元素，并且两次点击时间间隔小于300毫秒
    if (currentTime - lastTapTime < 300 && id === lastTapId) {
      // 双击事件处理 - 先待定，目前只显示提示
      this.handleDoubleTap(id);
    } else {
      // 单击事件处理 - 延迟执行，防止与双击冲突
      setTimeout(() => {
        if (this.lastTapId === id && this.lastTapTime === currentTime) {
          // 执行单击操作：切换药品服用状态
          const medications = this.data.medications.map(med => {
            if (med.id === id) {
              return { ...med, isTaken: !med.isTaken };
            }
            return med;
          });
          this.setData({ medications });
        }
      }, 300);
    }
  },
  
  // 双击操作处理函数（先待定）
  handleDoubleTap(id) {
    // 显示双击提示
    wx.showToast({
      title: '双击操作已触发',
      icon: 'none',
      duration: 1500
    });
    
    // 后续可以在这里添加实际的双击操作逻辑
  },

  // 返回按钮点击事件
  onBack() {
    wx.navigateBack();
  }
});