const app = getApp()

Page({
  data: {
    patientList: [], // 患者列表
    loading: false,
    doctorId: null,
    showMedModal: false,
    currentPatient: null,
    medTemplates: [
      { name: '氨氯地平', dosage: '1片/次' },
      { name: '缬沙坦', dosage: '1片/次' },
      { name: '非洛地平缓释片', dosage: '1片/次' },
      { name: '依那普利', dosage: '1片/次' }
    ],
    timeOptions: ['早饭前', '早饭后', '午饭前', '午饭后', '晚饭前', '晚饭后'],
    // selectedMeds: [{ name, checked, dosage, timeIndex }]
    selectedMeds: [],
    customName: '',
    customDose: '',
    customTimeIndex: 1
  },

  onLoad() {
    // 获取医生ID
    let doctorId = wx.getStorageSync('doctorId')
    if (!doctorId) {
      const userInfo = wx.getStorageSync('userInfo')
      if (userInfo && userInfo.worker_id) {
        doctorId = userInfo.worker_id
        wx.setStorageSync('doctorId', doctorId)
      }
    }

    if (!doctorId) {
      wx.showToast({ title: '请先登录', icon: 'none' })
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
      return
    }

    this.setData({ doctorId })
    this.loadPatientList()
  },

  onShow() {
    // 页面显示时重新加载患者列表（可能数据有更新）
    if (this.data.doctorId) {
      this.loadPatientList()
    }
  },

  // 加载患者列表
  loadPatientList() {
    const { doctorId } = this.data
    if (!doctorId) return

    this.setData({ loading: true })
    const apiBase = app.globalData.API_BASE

    wx.request({
      url: `${apiBase}/doctors/${doctorId}/patients`,
      header: {
        'Content-Type': 'application/json'
      },
      method: 'GET',
      success: (res) => {
        this.setData({ loading: false })
        
        if (res.data.ok && res.data.patients) {
          // 为每个患者加载最新血压记录
          this.loadLatestBpForPatients(res.data.patients)
        } else {
          wx.showToast({ title: '获取患者列表失败', icon: 'none' })
          this.setData({ patientList: [] })
        }
      },
      fail: (err) => {
        this.setData({ loading: false })
        console.error('加载患者列表失败：', err)
        wx.showToast({ title: '网络错误', icon: 'none' })
        this.setData({ patientList: [] })
      }
    })
  },

  // 为每个患者加载最新血压记录
  loadLatestBpForPatients(patients) {
    if (!patients || patients.length === 0) {
      this.setData({ patientList: [] })
      return
    }

    const apiBase = app.globalData.API_BASE
    const patientList = patients.map(p => ({
      ...p,
      avatarChar: (p.name && typeof p.name === 'string' && p.name.length > 0) ? p.name.charAt(0) : '未',
      latestBp: null, // 最新血压
      bpStatus: 'none' // 'normal', 'warning', 'danger', 'none'
    }))

    this.setData({ patientList })

    // 为每个患者获取最新血压
    patients.forEach((patient, index) => {
      wx.request({
        url: `${apiBase}/api/patients/${patient.user_id}/bp_records`,
        method: 'GET',
        success: (res) => {
          let latestBp = null
          let bpStatus = 'none'

          if (Array.isArray(res.data) && res.data.length > 0) {
            const latestRecord = res.data[0] // 已经按时间倒序排列
            if (latestRecord && latestRecord.systolic && latestRecord.diastolic) {
              latestBp = {
                systolic: latestRecord.systolic,
                diastolic: latestRecord.diastolic,
                measured_at: latestRecord.measured_at
              }

              // 判断血压状态
              if (latestRecord.systolic >= 180 || latestRecord.diastolic >= 120) {
                bpStatus = 'danger' // 危险（红色）
              } else if (latestRecord.systolic >= 140 || latestRecord.diastolic >= 90) {
                bpStatus = 'warning' // 警告（橙色）
              } else {
                bpStatus = 'normal' // 正常
              }
            }
          }

          // 更新对应患者的数据
          const updatedList = [...this.data.patientList]
          updatedList[index] = {
            ...updatedList[index],
            latestBp,
            bpStatus
          }
          this.setData({ patientList: updatedList })
        },
        fail: () => {
          // 获取失败，保持默认值
          console.error(`获取患者 ${patient.name} 的血压记录失败`)
        }
      })
    })
  },

  // 打开设置用药弹窗
  openMedModal(e) {
    const patient = e.currentTarget.dataset.patient
    if (!patient) return
    // 初始化选择项
    const selectedMeds = this.data.medTemplates.map(t => ({
      name: t.name,
      dosage: t.dosage,
      checked: false,
      timeIndex: 1 // 默认早饭后
    }))
    this.setData({ showMedModal: true, currentPatient: patient, selectedMeds, patientMeds: [] })
    // 加载已开药物
    this.loadExistingMeds(patient.user_id)
  },

  loadExistingMeds(userId) {
    const apiBase = app.globalData.API_BASE
    wx.request({
      url: `${apiBase}/api/patients/${userId}/medicines`,
      method: 'GET',
      success: (res) => {
        if (Array.isArray(res.data)) {
          this.setData({ patientMeds: res.data })
        }
      }
    })
  },

  // 关闭弹窗
  closeMedModal() {
    this.setData({ showMedModal: false, currentPatient: null })
  },

  onCustomName(e) {
    this.setData({ customName: e.detail.value })
  },

  // 修改待开药物的剂量
  onEditDosage(e) {
    const idx = e.currentTarget.dataset.index
    const value = e.detail.value
    const list = [...this.data.selectedMeds]
    if (list[idx]) {
      list[idx].dosage = value
      this.setData({ selectedMeds: list })
    }
  },

  // 删除已开药物
  deleteExistingMed(e) {
    const medId = e.currentTarget.dataset.medid
    const { currentPatient } = this.data
    if (!currentPatient || !medId) return
    const apiBase = app.globalData.API_BASE
    wx.showModal({
      title: '确认删除',
      content: '删除后将从患者处方移除该药物',
      success: (r) => {
        if (!r.confirm) return
        wx.request({
          url: `${apiBase}/api/patients/${currentPatient.user_id}/medicines/${medId}`,
          method: 'DELETE',
          success: (res) => {
            if (res.data && res.data.ok) {
              wx.showToast({ title: '已删除', icon: 'success' })
              this.loadExistingMeds(currentPatient.user_id)
            } else {
              wx.showToast({ title: '删除失败', icon: 'none' })
            }
          },
          fail: () => wx.showToast({ title: '网络错误', icon: 'none' })
        })
      }
    })
  },
  onCustomDose(e) {
    this.setData({ customDose: e.detail.value })
  },
  onCustomTime(e) {
    this.setData({ customTimeIndex: Number(e.detail.value) })
  },
  addCustomMed() {
    const { customName, customDose, customTimeIndex, selectedMeds } = this.data
    const name = (customName || '').trim()
    const dose = (customDose || '').trim()
    if (!name) {
      wx.showToast({ title: '请输入药物名称', icon: 'none' })
      return
    }
    const list = [...selectedMeds]
    list.unshift({ name, dosage: dose || '1片/次', checked: true, timeIndex: customTimeIndex || 1 })
    this.setData({ selectedMeds: list, customName: '', customDose: '' })
  },

  // 勾选药物
  toggleMedCheck(e) {
    const idx = e.currentTarget.dataset.index
    const list = [...this.data.selectedMeds]
    if (list[idx]) {
      list[idx].checked = !list[idx].checked
      this.setData({ selectedMeds: list })
    }
  },

  // 选择时间
  onTimeChange(e) {
    const idx = e.currentTarget.dataset.index
    const value = Number(e.detail.value)
    const list = [...this.data.selectedMeds]
    if (list[idx]) {
      list[idx].timeIndex = value
      this.setData({ selectedMeds: list })
    }
  },

  // 保存用药设置 -> 为每个勾选的药创建一条用药记录
  saveMedications() {
    const { currentPatient, selectedMeds, doctorId } = this.data
    if (!currentPatient || !doctorId) {
      wx.showToast({ title: '缺少必要信息', icon: 'none' })
      return
    }

    const apiBase = app.globalData.API_BASE
    const checkedItems = selectedMeds.filter(m => m.checked)
    if (checkedItems.length === 0) {
      wx.showToast({ title: '请至少选择一种药物', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })

    let done = 0, failed = 0
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const startDate = `${y}-${m}-${d}`

    checkedItems.forEach(item => {
      const timeLabel = this.data.timeOptions[item.timeIndex] || ''
      wx.request({
        url: `${apiBase}/api/patients/${currentPatient.user_id}/medicines`,
        method: 'POST',
        header: { 'Content-Type': 'application/json' },
        data: {
          drug_name: item.name,
          dose: item.dosage,
          frequency: timeLabel,
          start_date: startDate,
          end_date: null,
          prescriber: doctorId,
          notes: ''
        },
        success: () => { done++; checkAll(); },
        fail: () => { failed++; checkAll(); }
      })
    })

    const checkAll = () => {
      if (done + failed === checkedItems.length) {
        wx.hideLoading()
        if (failed === 0) {
          wx.showToast({ title: '已保存', icon: 'success' })
          this.closeMedModal()
        } else {
          wx.showToast({ title: `部分失败(${failed})`, icon: 'none' })
        }
      }
    }
  },

  goBack() {
    wx.navigateBack()
  },

  // 跳转到患者详情（血压历史页面）
  gotoPatientDetail(e) {
    const patient = e.currentTarget.dataset.patient
    if (patient) {
      wx.navigateTo({
        url: `/pages/blood/index?patientId=${patient.user_id}&patientName=${encodeURIComponent(patient.name || '')}`
      })
    }
  },

  playPatientMessage(e) {
    wx.showToast({
      title: '播放患者消息',
      icon: 'none'
    })
  },

  // 患者消息按钮点击事件
  gotoPatientMessage() {
     wx.navigateTo({
      url: '/pages/message/index'
    })
  }
})