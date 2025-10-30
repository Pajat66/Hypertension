# 患者注册性别选择器修复说明

## 问题描述
在患者注册页面的性别选择器中，选项显示为 "undefined"。

## 问题原因
1. **WXML配置错误**：
   - 使用了 `range-key="name"` 属性，但数据是字符串数组，不是对象数组
   - `value="{{gender}}"` 绑定的是性别值（M/F/U），而不是数组索引

2. **JavaScript逻辑不完整**：
   - 缺少对选择器索引和显示文本的正确处理

## 修复方案

### 1. WXML修复
```xml
<!-- 修复前 -->
<picker bindchange="onInputGender" value="{{gender}}" range="{{['男', '女', '未知']}}" range-key="name">
  <view class="picker">
    {{gender === 'M' ? '男' : gender === 'F' ? '女' : '未知'}}
  </view>
</picker>

<!-- 修复后 -->
<picker bindchange="onInputGender" value="{{genderIndex}}" range="{{['男', '女', '未知']}}">
  <view class="picker">
    {{genderText}}
  </view>
</picker>
```

### 2. JavaScript修复
```javascript
// 修复前
data: { 
  gender: 'U',
  // 缺少索引和显示文本
},

onInputGender(e) { 
  const genderMap = ['M', 'F', 'U'];
  this.setData({ gender: genderMap[e.detail.value] }); 
},

// 修复后
data: { 
  gender: 'U',
  genderIndex: 2, // 默认选择"未知"（索引2）
  genderText: '未知',
},

onInputGender(e) { 
  const genderMap = ['M', 'F', 'U'];
  const genderTexts = ['男', '女', '未知'];
  const index = parseInt(e.detail.value);
  this.setData({ 
    gender: genderMap[index],
    genderIndex: index,
    genderText: genderTexts[index]
  }); 
},
```

## 修复后的效果
- ✅ 性别选择器正确显示选项：男、女、未知
- ✅ 默认选择"未知"
- ✅ 选择后正确更新显示文本
- ✅ 提交时发送正确的性别值（M/F/U）

## 测试步骤
1. 打开患者注册页面
2. 点击性别选择器
3. 验证选项正确显示：男、女、未知
4. 选择不同选项，验证显示正确更新
5. 完成注册，验证后端接收到正确的性别值
