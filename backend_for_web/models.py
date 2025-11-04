
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime, timezone, date, time, timedelta
from enum import Enum

db = SQLAlchemy()

class GenderEnum(Enum):
    M = 'M'
    F = 'F'
    U = 'U'

class MethodEnum(Enum):
    MANUAL = 'manual'
    DEVICE = 'device'
    SELF_REPORT = 'self_report'

class PlanTypeEnum(Enum):
    MEDICATION = 'medication'
    BP_MEASURE = 'bp_measure'
    FOLLOWUP = 'followup'
    OTHER = 'other'

class ChannelEnum(Enum):
    APP_PUSH = 'app_push'
    SMS = 'sms'
    VOICE = 'voice'

class Patient(db.Model):
    """患者信息表"""
    __tablename__ = 'patients'
    
    user_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(100))
    phone = db.Column(db.String(20), unique=True, nullable=False, index=True)
    name = db.Column(db.String(100))
    id_card = db.Column(db.String(32))
    gender = db.Column(db.Enum(GenderEnum), default=GenderEnum.U)
    dob = db.Column(db.Date)
    village = db.Column(db.String(200), index=True)
    dialect = db.Column(db.String(100), index=True)
    height_cm = db.Column(db.Float)
    weight_kg = db.Column(db.Float)
    chronic_history = db.Column(db.Text)
    registered_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))
    
    # 关系
    bp_records = db.relationship("BpRecord", backref="patient", lazy=True, cascade="all, delete-orphan")
    medicines = db.relationship("Medicine", backref="patient", lazy=True, cascade="all, delete-orphan")
    doc_messages = db.relationship("DocMsg", backref="patient", lazy=True, cascade="all, delete-orphan")
    reminders = db.relationship("Reminder", backref="patient", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "user_id": self.user_id,
            "username": self.username,
            "phone": self.phone,
            "name": self.name,
            "id_card": self.id_card,
            "gender": self.gender.value if self.gender else None,
            "dob": self.dob.isoformat() if self.dob else None,
            "village": self.village,
            "dialect": self.dialect,
            "height_cm": self.height_cm,
            "weight_kg": self.weight_kg,
            "chronic_history": self.chronic_history,
            "registered_at": self.registered_at.isoformat() if self.registered_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

class Doctor(db.Model):
    """医生信息表"""
    __tablename__ = 'doctors'
    
    worker_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(50), index=True)
    phone = db.Column(db.String(20))
    village = db.Column(db.String(200), index=True)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))
    
    # 关系
    bp_records_measured = db.relationship("BpRecord", backref="measured_by_doctor", lazy=True, foreign_keys="BpRecord.measured_by")
    medicines_prescribed = db.relationship("Medicine", backref="prescriber_doctor", lazy=True, foreign_keys="Medicine.prescriber")
    messages_sent = db.relationship("DocMsg", backref="sender_doctor", lazy=True, foreign_keys="DocMsg.worker_id")
    replies_sent = db.relationship("DocMsg", backref="replier_doctor", lazy=True, foreign_keys="DocMsg.reply_by")

    def to_dict(self):
        return {
            "worker_id": self.worker_id,
            "name": self.name,
            "role": self.role,
            "phone": self.phone,
            "village": self.village,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class BpRecord(db.Model):
    """血压信息记录表"""
    __tablename__ = 'bp_records'
    
    record_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('patients.user_id', ondelete='CASCADE'), nullable=False, index=True)
    systolic = db.Column(db.Integer)
    diastolic = db.Column(db.Integer)
    heart_rate = db.Column(db.Integer)
    measured_at = db.Column(db.DateTime, index=True)
    method = db.Column(db.Enum(MethodEnum))
    device_id = db.Column(db.Integer)
    measured_by = db.Column(db.Integer, db.ForeignKey('doctors.worker_id', ondelete='SET NULL'), index=True)
    notes = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "record_id": self.record_id,
            "user_id": self.user_id,
            "systolic": self.systolic,
            "diastolic": self.diastolic,
            "heart_rate": self.heart_rate,
            "measured_at": self.measured_at.isoformat() if self.measured_at else None,
            "method": self.method.value if self.method else None,
            "device_id": self.device_id,
            "measured_by": self.measured_by,
            "notes": self.notes,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }

class Medicine(db.Model):
    """用药记录表"""
    __tablename__ = 'medicine'
    
    med_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('patients.user_id', ondelete='CASCADE'), nullable=False, index=True)
    drug_name = db.Column(db.String(200))
    dose = db.Column(db.String(100))
    frequency = db.Column(db.String(100))
    start_date = db.Column(db.Date, index=True)
    end_date = db.Column(db.Date)
    prescriber = db.Column(db.Integer, db.ForeignKey('doctors.worker_id', ondelete='SET NULL'), index=True)
    notes = db.Column(db.Text)
    updated_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "med_id": self.med_id,
            "user_id": self.user_id,
            "drug_name": self.drug_name,
            "dose": self.dose,
            "frequency": self.frequency,
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "prescriber": self.prescriber,
            "notes": self.notes,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

class DocMsg(db.Model):
    """村医留言表"""
    __tablename__ = 'doc_msg'
    
    msg_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('patients.user_id', ondelete='CASCADE'), nullable=False, index=True)
    worker_id = db.Column(db.Integer, db.ForeignKey('doctors.worker_id', ondelete='SET NULL'), index=True)
    village = db.Column(db.String(200), index=True)
    subject = db.Column(db.String(200))
    content = db.Column(db.Text)
    media_url = db.Column(db.String(255))
    is_read = db.Column(db.Boolean, default=False)
    replied = db.Column(db.Boolean, default=False)
    reply_text = db.Column(db.Text)
    reply_by = db.Column(db.Integer, db.ForeignKey('doctors.worker_id', ondelete='SET NULL'))
    reply_at = db.Column(db.DateTime)
    urgent = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), index=True)
    updated_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "msg_id": self.msg_id,
            "user_id": self.user_id,
            "worker_id": self.worker_id,
            "village": self.village,
            "subject": self.subject,
            "content": self.content,
            "media_url": self.media_url,
            "is_read": self.is_read,
            "replied": self.replied,
            "reply_text": self.reply_text,
            "reply_by": self.reply_by,
            "reply_at": self.reply_at.isoformat() if self.reply_at else None,
            "urgent": self.urgent,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

class Reminder(db.Model):
    """提醒表"""
    __tablename__ = 'reminder'
    
    plan_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('patients.user_id', ondelete='CASCADE'), nullable=False, index=True)
    plan_type = db.Column(db.Enum(PlanTypeEnum), index=True)
    title = db.Column(db.String(200))
    description = db.Column(db.String(500))
    cron_expr = db.Column(db.String(100))
    time_of_day = db.Column(db.Time, index=True)
    weekdays = db.Column(db.String(20))
    channel = db.Column(db.Enum(ChannelEnum), default=ChannelEnum.APP_PUSH)
    enabled = db.Column(db.Boolean, default=True, index=True)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))

    def to_dict(self):
        return {
            "plan_id": self.plan_id,
            "user_id": self.user_id,
            "plan_type": self.plan_type.value if self.plan_type else None,
            "title": self.title,
            "description": self.description,
            "cron_expr": self.cron_expr,
            "time_of_day": self.time_of_day.isoformat() if self.time_of_day else None,
            "weekdays": self.weekdays,
            "channel": self.channel.value if self.channel else None,
            "enabled": self.enabled,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }

class DoctorReminder(db.Model):
    """医生提醒表"""
    __tablename__ = 'doctor_reminders'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    doctor_id = db.Column(db.Integer, db.ForeignKey('doctors.worker_id', ondelete='CASCADE'), nullable=False, index=True)
    content = db.Column(db.Text, nullable=False)
    target_type = db.Column(db.String(20), nullable=False)  # 'all', 'noRecord', 'abnormal'
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), index=True)
    
    # 关系
    doctor = db.relationship("Doctor", backref="reminders_sent", lazy=True)
    patient_reminders = db.relationship("PatientReminder", backref="doctor_reminder", lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id,
            "doctor_id": self.doctor_id,
            "content": self.content,
            "target_type": self.target_type,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "doctor_name": self.doctor.name if self.doctor else None
        }

class PatientReminder(db.Model):
    """患者提醒表"""
    __tablename__ = 'patient_reminders'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    doctor_reminder_id = db.Column(db.Integer, db.ForeignKey('doctor_reminders.id', ondelete='CASCADE'), nullable=False, index=True)
    # 使用 name 参数支持数据库中可能存在的 patient_id 列名，同时保持代码中使用 user_id
    user_id = db.Column(db.Integer, db.ForeignKey('patients.user_id', ondelete='CASCADE'), name='patient_id', nullable=False, index=True)
    is_listened = db.Column(db.Boolean, default=False, index=True)
    audio_path = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), index=True)
    
    # 关系，使用延迟加载和连接加载优化
    patient = db.relationship("Patient", 
                            backref=db.backref("reminders_received", 
                                             lazy="dynamic",
                                             order_by="desc(PatientReminder.created_at)"), 
                            lazy="joined")

    def to_dict(self):
        """转换为字典格式，包含更多上下文信息"""
        # 安全地处理时区转换
        created_at = None
        if self.created_at:
            try:
                # 如果 created_at 没有时区信息，先添加 UTC 时区
                created_at_aware = self.created_at
                if created_at_aware.tzinfo is None:
                    created_at_aware = created_at_aware.replace(tzinfo=timezone.utc)
                # 转换为东八区时间
                created_at = created_at_aware.astimezone(timezone(timedelta(hours=8)))
            except Exception as e:
                print(f"转换 created_at 时出错: {str(e)}")
                # 如果转换失败，使用原始值
                created_at = self.created_at
        
        doctor_reminder = self.doctor_reminder if self.doctor_reminder else None
        doctor = doctor_reminder.doctor if doctor_reminder else None

        return {
            "id": self.id,
            "doctor_reminder_id": self.doctor_reminder_id,
            "user_id": self.user_id,  # 统一使用user_id
            "is_listened": self.is_listened,
            "audio_path": self.audio_path,
            "content": doctor_reminder.content if doctor_reminder else None,
            "created_at": created_at.strftime('%Y-%m-%d %H:%M:%S') if created_at and hasattr(created_at, 'strftime') else (str(created_at) if created_at else None),
            "doctor_id": doctor.worker_id if doctor else None,
            "doctor_name": doctor.name if doctor else None,
            "relative_time": self._get_relative_time(),
            # 添加更多上下文信息
            "patient_name": self.patient.name if self.patient else None,
            "village": self.patient.village if self.patient else None,
            "doctor_role": doctor.role if doctor else None
        }
        
    def _get_relative_time(self):
        """获取相对时间显示"""
        if not self.created_at:
            return ''
        
        # 确保 created_at 是带时区的，如果不是则添加 UTC 时区
        created_at_aware = self.created_at
        if created_at_aware.tzinfo is None:
            created_at_aware = created_at_aware.replace(tzinfo=timezone.utc)
        
        now = datetime.now(timezone.utc)
        diff = now - created_at_aware
        
        if diff.days > 7:
            # 转换为东八区时间
            created_at_cst = created_at_aware.astimezone(timezone(timedelta(hours=8)))
            return created_at_cst.strftime('%Y-%m-%d')
        elif diff.days > 0:
            return f'{diff.days}天前'
        elif diff.seconds >= 3600:
            hours = diff.seconds // 3600
            return f'{hours}小时前'
        elif diff.seconds >= 60:
            minutes = diff.seconds // 60
            return f'{minutes}分钟前'
        else:
            return '刚刚'

class ChatMessage(db.Model):
    """聊天消息表"""
    __tablename__ = 'chat_messages'
    
    msg_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    patient_id = db.Column(db.Integer, db.ForeignKey('patients.user_id', ondelete='CASCADE'), nullable=False, index=True)
    doctor_id = db.Column(db.Integer, db.ForeignKey('doctors.worker_id', ondelete='CASCADE'), nullable=False, index=True)
    sender_type = db.Column(db.String(20), nullable=False)  # 'patient' or 'doctor'
    content = db.Column(db.Text, nullable=False)
    is_read = db.Column(db.Boolean, default=False, index=True)
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), index=True)
    
    # 关系
    patient = db.relationship("Patient", backref="chat_messages", lazy=True)
    doctor = db.relationship("Doctor", backref="chat_messages", lazy=True)

    def to_dict(self):
        return {
            "msg_id": self.msg_id,
            "patient_id": self.patient_id,
            "doctor_id": self.doctor_id,
            "sender_type": self.sender_type,
            "content": self.content,
            "is_read": self.is_read,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "patient_name": self.patient.name if self.patient else None,
            "doctor_name": self.doctor.name if self.doctor else None
        }

class BpAnalysis(db.Model):
    """血压趋势分析表"""
    __tablename__ = 'bp_analysis'
    
    analysis_id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    user_id = db.Column(db.Integer, db.ForeignKey('patients.user_id', ondelete='CASCADE'), nullable=False, index=True)
    worker_id = db.Column(db.Integer, db.ForeignKey('doctors.worker_id', ondelete='SET NULL'), index=True)
    analysis_text = db.Column(db.Text, nullable=False)  # 趋势分析文本
    created_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), index=True)
    updated_at = db.Column(db.DateTime, default=datetime.now(timezone.utc), onupdate=datetime.now(timezone.utc))
    
    # 关系
    patient = db.relationship("Patient", backref="bp_analyses", lazy=True)
    doctor = db.relationship("Doctor", backref="bp_analyses", lazy=True)

    def to_dict(self):
        return {
            "analysis_id": self.analysis_id,
            "user_id": self.user_id,
            "worker_id": self.worker_id,
            "analysis_text": self.analysis_text,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "patient_name": self.patient.name if self.patient else None,
            "doctor_name": self.doctor.name if self.doctor else None
        }