# app.py
# -*- coding: utf-8 -*-
import os
import re
import uuid
import traceback
from typing import Optional, Tuple
from datetime import datetime, timezone, timedelta

from flask import Flask, jsonify, send_from_directory, request
from flask_cors import CORS
from models import (
    db, Patient, Doctor, BpRecord, Medicine, DocMsg, Reminder, ChatMessage, 
    DoctorReminder, PatientReminder, BpAnalysis,
    GenderEnum, MethodEnum, PlanTypeEnum, ChannelEnum
)

# 讯飞 ASR/TTS（无 pydub 版，基于 ffmpeg 转码）
# 文件需与 app.py 
from tts import asr_iflytek, tts_iflytek


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        # 更换网络时记得改 IP
        "mysql+pymysql://project:Zbp42682600@192.168.164.117:3306/hypertension_db?charset=utf8mb4"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False


def cleanup_old_audio_files():
    """清理超过30天的音频文件"""
    try:
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=30)
        old_reminders = PatientReminder.query.filter(
            PatientReminder.created_at < cutoff_date,
            PatientReminder.is_listened == True  # 只清理已听过的
        ).all()
        
        cleaned_count = 0
        for reminder in old_reminders:
            if reminder.audio_path:
                try:
                    file_path = os.path.join(os.path.dirname(__file__), reminder.audio_path.lstrip('/'))
                    if os.path.exists(file_path):
                        os.remove(file_path)
                        cleaned_count += 1
                except Exception as e:
                    print(f"清理音频文件失败: {e}")
        print(f"成功清理 {cleaned_count} 个过期音频文件")
    except Exception as e:
        print(f"执行清理任务失败: {e}")

def create_app():
    app = Flask(__name__, static_folder="static", static_url_path="/")
    app.config.from_object(Config)

    # 允许所有路由的跨域访问
    CORS(app, resources={r"/*": {
        "origins": "*",
        "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        "allow_headers": ["Content-Type", "Authorization"]
    }}, supports_credentials=False)

    db.init_app(app)
    
    # 注册定时清理任务
    if not app.debug:
        def run_cleanup():
            with app.app_context():
                cleanup_old_audio_files()
                
        from apscheduler.schedulers.background import BackgroundScheduler
        scheduler = BackgroundScheduler()
        scheduler.add_job(run_cleanup, 'cron', hour=3)  # 每天凌晨3点执行
        scheduler.start()

    static_dir = os.path.join(app.root_path, "static")
    os.makedirs(static_dir, exist_ok=True)

  
    # 小工具：从中文里解析血压/心率

    def parse_bp(text: str) -> Tuple[Optional[int], Optional[int], Optional[int]]:
        """
        返回 (systolic, diastolic, pulse)
        可识别的范式：
          - "120 80" (两个数字，空格分隔，自动大数为大压，小数为小压)
          - "高压120 低压80 心率70 / 脉搏70"
          - "收缩压120 舒张压80"
          - "120/80 心率70"
          - "高压一百二" 这种中文数字这里不处理（可后续扩展）
        """
        if not text:
            return None, None, None

        # 提取所有数字
        numbers = re.findall(r"\d{2,3}", text)
        
        # 如果只有两个数字，且格式为 "数字 数字" 或 "数字/数字"
        if len(numbers) == 2:
            num1, num2 = int(numbers[0]), int(numbers[1])
            # 自动确定大压和小压
            systolic = max(num1, num2)
            diastolic = min(num1, num2)
            # 验证合理性
            if 50 <= systolic <= 250 and 40 <= diastolic <= 150 and systolic >= diastolic:
                return systolic, diastolic, None

        # 120/80 或 120-80
        m = re.search(r"(\d{2,3})\s*[/\-]\s*(\d{2,3})", text)
        if m:
            sys_v = int(m.group(1))
            dia_v = int(m.group(2))
            # 心率(脉搏)
            pulse = None
            p = re.search(r"(心率|脉搏)[^\d]{0,3}(\d{2,3})", text)
            if p:
                pulse = int(p.group(2))
            return sys_v, dia_v, pulse

        # 高压 / 低压
        sys_v = None
        dia_v = None
        p1 = re.search(r"(高压|收缩压)[^\d]{0,3}(\d{2,3})", text)
        if p1:
            sys_v = int(p1.group(2))
        p2 = re.search(r"(低压|舒张压)[^\d]{0,3}(\d{2,3})", text)
        if p2:
            dia_v = int(p2.group(2))
        p3 = re.search(r"(心率|脉搏)[^\d]{0,3}(\d{2,3})", text)
        pulse = int(p3.group(2)) if p3 else None

        return sys_v, dia_v, pulse


    # 健康检查 / 示例
  
    @app.route("/api/healthz")
    def healthz():
        return jsonify({"ok": True})

    @app.route("/api/ping")
    def ping():
        return jsonify({"message": "pong"})

    @app.route("/api/patients")
    def patients():
        data = [p.to_dict() for p in Patient.query.order_by(Patient.user_id.desc()).all()]
        return jsonify(data)

    # 语音转文字（讯飞 IAT）
 
    @app.route("/api/voice2text", methods=["POST"])
    def voice2text():
        """
        小程序用 wx.uploadFile 上传录音文件（mp3/wav/aac）
        这里保存到 static/ 临时文件，然后走讯飞 IAT 做识别
        返回：{"text": "...识别结果..."}
        """
        file = request.files.get("file")
        if not file:
            return jsonify({"error": "no file"}), 400

        # 保存上传文件
        upload_path = os.path.join(static_dir, f"upload-{uuid.uuid4().hex}.mp3")
        file.save(upload_path)

        text = ""
        try:
            text = asr_iflytek(upload_path)  # 讯飞识别（内部自动 ffmpeg 转成 16k PCM）
            return jsonify({"text": text or ""})
        except Exception as e:
            print("ASR失败：", e)
            return jsonify({"error": "asr_fail", "detail": str(e)}), 500
        finally:
            # 识别完成后清理本次上传文件及转换产生的临时文件，避免占用空间
            try:
                if os.path.exists(upload_path):
                    os.remove(upload_path)
            except Exception:
                pass
            try:
                pcm16k_path = upload_path + ".16k.wav"
                if os.path.exists(pcm16k_path):
                    os.remove(pcm16k_path)
            except Exception:
                pass

   
    # 文本转语音（讯飞 TTS）
   
    @app.route("/api/speak", methods=["POST"])
    def speak():
        """
        前端 POST: {"text":"要朗读的内容"}
        返回：{"audio_url": "/static/tts-xxxx.mp3"}
        """
        data = request.get_json(silent=True) or {}
        text = (data.get("text") or "").strip()
        if not text:
            return jsonify({"error": "text is required"}), 400

        try:
            audio_bytes = tts_iflytek(text, voice="xiaoyan", aue="lame")  # mp3
            filename = f"tts-{uuid.uuid4().hex}.mp3"
            out_path = os.path.join(static_dir, filename)
            with open(out_path, "wb") as f:
                f.write(audio_bytes)
            return jsonify({"audio_url": f"/static/{filename}"})
        except Exception as e:
            print("TTS失败：", e)
            return jsonify({"error": "tts_fail", "detail": str(e)}), 500

    
    # 保存测量（解析文本 -> 入库）

    @app.route("/api/save_measure", methods=["POST"])
    def save_measure():
        """
        前端提交识别到的文本，后端尝试解析"收缩压/舒张压/心率"，入库 BpRecord。
        返回保存结果与解析出的数值（可能为空）。
        """
        data = request.get_json(silent=True) or {}
        raw_text = (data.get("text") or "").strip()
        user_id = data.get("user_id")  # 新增：获取用户ID

        # 取得一个患者（没有则创建一个演示用）
        if user_id:
            patient = Patient.query.filter_by(user_id=user_id).first()
        else:
            patient = Patient.query.order_by(Patient.user_id.asc()).first()
        
        if not patient:
            patient = Patient(
                name="示例患者", 
                gender=GenderEnum.U, 
                phone="13800000000",
                village="示例村"
            )
            db.session.add(patient)
            db.session.commit()

        systolic, diastolic, pulse = parse_bp(raw_text)

        bp_record = BpRecord(
            user_id=patient.user_id,
            systolic=systolic,
            diastolic=diastolic,
            heart_rate=pulse,
            method=MethodEnum.SELF_REPORT,
            measured_at=datetime.now(timezone.utc)
        )
        db.session.add(bp_record)
        db.session.commit()

        return jsonify({
            "ok": True,
            "record_id": bp_record.record_id,
            "user_id": patient.user_id,
            "parsed": {"systolic": systolic, "diastolic": diastolic, "heart_rate": pulse},
            "raw_text": raw_text
        })

    # 添加患者注册API
    @app.route("/api/patients", methods=["POST"])
    def create_patient():
        """创建新患者"""
        data = request.get_json(silent=True) or {}
        
        patient = Patient(
            username=data.get("username"),
            phone=data.get("phone"),
            name=data.get("name"),
            id_card=data.get("id_card"),
            gender=GenderEnum(data.get("gender", "U")),
            dob=datetime.strptime(data.get("dob"), "%Y-%m-%d").date() if data.get("dob") else None,
            village=data.get("village"),
            dialect=data.get("dialect"),
            height_cm=data.get("height_cm"),
            weight_kg=data.get("weight_kg"),
            chronic_history=data.get("chronic_history")
        )
        
        db.session.add(patient)
        db.session.commit()
        
        return jsonify({"ok": True, "patient": patient.to_dict()})

    # 添加血压记录查询API
    @app.route("/api/patients/<int:user_id>/bp_records")
    def get_bp_records(user_id):
        """获取患者的血压记录"""
        records = BpRecord.query.filter_by(user_id=user_id).order_by(BpRecord.measured_at.desc()).all()
        return jsonify([r.to_dict() for r in records])

    # 血压趋势分析API
    @app.route("/api/patients/<int:user_id>/bp_analysis", methods=["GET"])
    def get_bp_analysis(user_id):
        """获取患者的最新血压趋势分析"""
        try:
            # 获取最新的分析记录
            analysis = BpAnalysis.query.filter_by(user_id=user_id)\
                .order_by(BpAnalysis.created_at.desc())\
                .first()
            
            if analysis:
                return jsonify({
                    "ok": True,
                    "analysis": analysis.to_dict()
                })
            else:
                return jsonify({
                    "ok": True,
                    "analysis": None
                })
        except Exception as e:
            print(f"获取血压趋势分析失败: {str(e)}")
            return jsonify({
                "ok": False,
                "error": "获取血压趋势分析失败",
                "debug_info": str(e)
            }), 500

    @app.route("/api/patients/<int:user_id>/bp_analysis", methods=["POST"])
    def create_bp_analysis(user_id):
        """创建或更新患者的血压趋势分析"""
        try:
            data = request.get_json(silent=True) or {}
            analysis_text = data.get("analysis_text", "").strip()
            worker_id = data.get("worker_id")  # 医生ID
            
            if not analysis_text:
                return jsonify({
                    "ok": False,
                    "error": "分析文本不能为空"
                }), 400

            # 验证患者是否存在
            patient = Patient.query.get(user_id)
            if not patient:
                return jsonify({
                    "ok": False,
                    "error": "患者不存在"
                }), 404

            # 验证医生是否存在（如果提供了医生ID）
            if worker_id:
                doctor = Doctor.query.get(worker_id)
                if not doctor:
                    return jsonify({
                        "ok": False,
                        "error": "医生不存在"
                    }), 404

            # 创建新的分析记录（每次保存都创建新记录，保留历史）
            analysis = BpAnalysis(
                user_id=user_id,
                worker_id=worker_id,
                analysis_text=analysis_text
            )
            
            db.session.add(analysis)
            db.session.commit()

            return jsonify({
                "ok": True,
                "analysis": analysis.to_dict()
            })
        except Exception as e:
            db.session.rollback()
            print(f"创建血压趋势分析失败: {str(e)}")
            return jsonify({
                "ok": False,
                "error": "创建血压趋势分析失败",
                "debug_info": str(e)
            }), 500

    # 添加用药记录API
    @app.route("/api/patients/<int:user_id>/medicines")
    def get_medicines(user_id):
        """获取患者的用药记录"""
        medicines = Medicine.query.filter_by(user_id=user_id).order_by(Medicine.start_date.desc()).all()
        return jsonify([m.to_dict() for m in medicines])

    # 添加用药记录创建API
    @app.route("/api/patients/<int:user_id>/medicines", methods=["POST"])
    def create_medicine(user_id):
        """为患者添加用药记录"""
        data = request.get_json(silent=True) or {}
        
        medicine = Medicine(
            user_id=user_id,
            drug_name=data.get("drug_name"),
            dose=data.get("dose"),
            frequency=data.get("frequency"),
            start_date=datetime.strptime(data.get("start_date"), "%Y-%m-%d").date() if data.get("start_date") else None,
            end_date=datetime.strptime(data.get("end_date"), "%Y-%m-%d").date() if data.get("end_date") else None,
            prescriber=data.get("prescriber"),
            notes=data.get("notes")
        )
        
        db.session.add(medicine)
        db.session.commit()
        
        return jsonify({"ok": True, "medicine": medicine.to_dict()})

    # 删除指定用药记录
    @app.route("/api/patients/<int:user_id>/medicines/<int:med_id>", methods=["DELETE"])
    def delete_medicine(user_id, med_id):
        try:
            med = Medicine.query.filter_by(user_id=user_id, med_id=med_id).first()
            if not med:
                return jsonify({"ok": False, "error": "用药记录不存在"}), 404
            db.session.delete(med)
            db.session.commit()
            return jsonify({"ok": True})
        except Exception as e:
            db.session.rollback()
            return jsonify({"ok": False, "error": "删除失败", "debug_info": str(e)}), 500

    # 添加医生留言API
    @app.route("/api/patients/<int:user_id>/messages", methods=["POST"])
    def create_message(user_id):
        """为患者创建医生留言"""
        data = request.get_json(silent=True) or {}
        
        message = DocMsg(
            user_id=user_id,
            worker_id=data.get("worker_id"),
            village=data.get("village"),
            subject=data.get("subject"),
            content=data.get("content"),
            media_url=data.get("media_url"),
            urgent=data.get("urgent", False)
        )
        
        db.session.add(message)
        db.session.commit()
        
        return jsonify({"ok": True, "message": message.to_dict()})

    # 获取患者留言API
    @app.route("/api/patients/<int:user_id>/messages")
    def get_messages(user_id):
        """获取患者的留言记录"""
        messages = DocMsg.query.filter_by(user_id=user_id).order_by(DocMsg.created_at.desc()).all()
        return jsonify([m.to_dict() for m in messages])

    # 添加提醒API
    @app.route("/api/patients/<int:user_id>/reminders", methods=["POST"])
    def create_reminder(user_id):
        """为患者创建提醒"""
        data = request.get_json(silent=True) or {}
        
        reminder = Reminder(
            user_id=user_id,
            plan_type=PlanTypeEnum(data.get("plan_type", "other")),
            title=data.get("title"),
            description=data.get("description"),
            cron_expr=data.get("cron_expr"),
            time_of_day=datetime.strptime(data.get("time_of_day"), "%H:%M").time() if data.get("time_of_day") else None,
            weekdays=data.get("weekdays"),
            channel=ChannelEnum(data.get("channel", "app_push")),
            enabled=data.get("enabled", True)
        )
        
        db.session.add(reminder)
        db.session.commit()
        
        return jsonify({"ok": True, "reminder": reminder.to_dict()})

    # 获取患者定时提醒API (计划任务提醒)
    @app.route("/api/patients/<int:user_id>/scheduled_reminders")
    def get_scheduled_reminders(user_id):
        """获取患者的定时提醒记录"""
        reminders = Reminder.query.filter_by(user_id=user_id).order_by(Reminder.created_at.desc()).all()
        return jsonify([r.to_dict() for r in reminders])

    # 添加医生管理API
    @app.route("/api/doctors")
    def get_doctors():
        """获取所有医生"""
        doctors = Doctor.query.order_by(Doctor.worker_id.desc()).all()
        return jsonify([d.to_dict() for d in doctors])
        
    @app.route("/api/doctors/<int:doctor_id>")
    def get_doctor(doctor_id):
        """获取单个医生的详细信息"""
        doctor = Doctor.query.get(doctor_id)
        if not doctor:
            return jsonify({"error": "医生不存在"}), 404
        return jsonify({"ok": True, "doctor": doctor.to_dict()})

    @app.route("/api/doctors", methods=["POST"])
    def create_doctor():
        """创建新医生"""
        data = request.get_json(silent=True) or {}
        
        doctor = Doctor(
            name=data.get("name"),
            role=data.get("role"),
            phone=data.get("phone"),
            village=data.get("village")
        )
        
        db.session.add(doctor)
        db.session.commit()
        
        return jsonify({"ok": True, "doctor": doctor.to_dict()})

    # 添加登录API
    @app.route("/doctors/login", methods=["POST"])
    def doctor_login():
        """医生登录"""
        data = request.get_json(silent=True) or {}
        print("收到医生登录请求:", data)
        phone = data.get("phone", "").strip()
        password = data.get("password", "").strip()
        
        if not phone or not password:
            return jsonify({"error": "手机号和密码不能为空"}), 400
        
        # 查找医生（这里简化处理，实际项目中应该有密码加密）
        doctor = Doctor.query.filter_by(phone=phone).first()
        if not doctor:
            return jsonify({"error": "医生不存在"}), 404
        
        # 这里简化密码验证，实际项目中应该使用加密密码
        # 暂时使用手机号后4位作为密码进行演示
        if password != phone[-4:]:
            return jsonify({"error": "密码错误"}), 401
        
        return jsonify({
            "ok": True,
            "token": f"doctor_{doctor.worker_id}_{phone}",  # 简单的token生成
            "user": doctor.to_dict(),
            "user_type": "doctor"
        })

    @app.route("/api/patients/login", methods=["POST"])
    def patient_login():
        """患者登录"""
        data = request.get_json(silent=True) or {}
        phone = data.get("phone", "").strip()
        password = data.get("password", "").strip()
        
        if not phone or not password:
            return jsonify({"error": "手机号和密码不能为空"}), 400
        
        # 查找患者
        patient = Patient.query.filter_by(phone=phone).first()
        if not patient:
            return jsonify({"error": "患者不存在"}), 404
        
        # 这里简化密码验证，实际项目中应该使用加密密码
        # 暂时使用手机号后4位作为密码进行演示
        if password != phone[-4:]:
            return jsonify({"error": "密码错误"}), 401
        
        return jsonify({
            "ok": True,
            "token": f"patient_{patient.user_id}_{phone}",  # 简单的token生成
            "user": patient.to_dict(),
            "user_type": "patient"
        })

    # 添加注册API
    @app.route("/api/doctors/register", methods=["POST"])
    def doctor_register():
        """医生注册"""
        data = request.get_json(silent=True) or {}
        name = data.get("name", "").strip()
        phone = data.get("phone", "").strip()
        password = data.get("password", "").strip()
        confirm_password = data.get("confirm_password", "").strip()
        doctor_id = data.get("doctor_id", "").strip()
        role = data.get("role", "村医").strip()
        village = data.get("village", "").strip()
        
        # 验证必填字段
        if not all([name, phone, password, confirm_password]):
            return jsonify({"error": "请完整填写必填信息"}), 400
        
        # 验证密码
        if password != confirm_password:
            return jsonify({"error": "两次密码不一致"}), 400
        
        if len(password) < 4:
            return jsonify({"error": "密码长度不能少于4位"}), 400
        
        # 验证手机号格式
        if not phone.isdigit() or len(phone) != 11:
            return jsonify({"error": "请输入正确的手机号"}), 400
        
        # 检查手机号是否已存在
        existing_doctor = Doctor.query.filter_by(phone=phone).first()
        if existing_doctor:
            return jsonify({"error": "该手机号已被注册"}), 400
        
        # 创建新医生
        doctor = Doctor(
            name=name,
            phone=phone,
            role=role,
            village=village
        )
        
        try:
            db.session.add(doctor)
            db.session.commit()
            
            return jsonify({
                "ok": True,
                "message": "注册成功",
                "doctor": doctor.to_dict()
            })
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": "注册失败，请重试"}), 500

    @app.route("/api/patients/register", methods=["POST"])
    def patient_register():
        """患者注册"""
        data = request.get_json(silent=True) or {}
        name = data.get("name", "").strip()
        phone = data.get("phone", "").strip()
        password = data.get("password", "").strip()
        confirm_password = data.get("confirm_password", "").strip()
        gender = data.get("gender", "U").strip()
        village = data.get("village", "").strip()
        dialect = data.get("dialect", "普通话").strip()
        
        # 验证必填字段
        if not all([name, phone, password, confirm_password]):
            return jsonify({"error": "请完整填写必填信息"}), 400
        
        # 验证密码
        if password != confirm_password:
            return jsonify({"error": "两次密码不一致"}), 400
        
        if len(password) < 4:
            return jsonify({"error": "密码长度不能少于4位"}), 400
        
        # 验证手机号格式
        if not phone.isdigit() or len(phone) != 11:
            return jsonify({"error": "请输入正确的手机号"}), 400
        
        # 检查手机号是否已存在
        existing_patient = Patient.query.filter_by(phone=phone).first()
        if existing_patient:
            return jsonify({"error": "该手机号已被注册"}), 400
        
        # 创建新患者
        patient = Patient(
            name=name,
            phone=phone,
            gender=GenderEnum(gender),
            village=village,
            dialect=dialect
        )
        
        try:
            db.session.add(patient)
            db.session.commit()
            
            return jsonify({
                "ok": True,
                "message": "注册成功",
                "patient": patient.to_dict()
            })
        except Exception as e:
            db.session.rollback()
            return jsonify({"error": "注册失败，请重试"}), 500

    # =========================
    # 提醒系统API
    # =========================
    
    @app.route("/api/doctor/reminders", methods=["POST", "OPTIONS"])
    def create_doctor_reminder():
        """医生创建提醒"""
        if request.method == "OPTIONS":
            return jsonify({"ok": True})
            
        print("\n========== 创建医生提醒 ==========")
        
        # 第一步：验证请求数据
        try:
            data = request.get_json(silent=True)
            if not data:
                print("错误: 无效的JSON数据")
                return jsonify({"error": "无效的请求数据", "detail": "请求体必须是JSON格式"}), 400
                
            doctor_id = data.get("doctor_id")
            content = data.get("content", "").strip()
            target_type = data.get("target_type")  # 'all', 'noRecord', 'abnormal'
            
            print(f"医生ID: {doctor_id}")
            print(f"提醒内容: {content}")
            print(f"目标类型: {target_type}")
            
            # 验证参数
            if not doctor_id:
                return jsonify({"error": "缺少医生ID"}), 400
            if not content:
                return jsonify({"error": "提醒内容不能为空"}), 400
            if not target_type:
                return jsonify({"error": "请选择目标患者类型"}), 400
            if target_type not in ['all', 'noRecord', 'abnormal']:
                return jsonify({"error": "无效的目标患者类型"}), 400
                
        except Exception as e:
            print(f"错误: 处理请求数据失败 - {str(e)}")
            return jsonify({
                "error": "处理请求数据失败",
                "detail": str(e) if app.debug else "请检查请求格式是否正确"
            }), 400
            
        # 第二步：验证医生信息并创建提醒记录
        try:
            doctor = Doctor.query.get(doctor_id)
            if not doctor:
                print(f"错误: 找不到ID为{doctor_id}的医生")
                return jsonify({"error": "医生不存在"}), 404
                
            if not doctor.village:
                print(f"错误: 医生 {doctor.name} 未设置所属村庄")
                return jsonify({"error": "医生未设置所属村庄"}), 400
                
            # 创建医生提醒记录
            reminder = DoctorReminder(
                doctor_id=doctor_id,
                content=content,
                target_type=target_type
            )
            db.session.add(reminder)
            db.session.flush()  # 获取reminder.id
            
        except Exception as e:
            print(f"错误: 验证医生信息失败 - {str(e)}")
            db.session.rollback()
            return jsonify({
                "error": "验证医生信息失败",
                "detail": str(e) if app.debug else "请检查医生信息是否正确"
            }), 500
        
        # 第三步：查询目标患者
        try:
            if target_type == 'all':
                print(f"目标：{doctor.village}的所有患者")
                patients = Patient.query.filter_by(village=doctor.village).all()
            elif target_type == 'noRecord':
                print(f"目标：{doctor.village}的7天内未记录血压的患者")
                seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
                subquery = db.session.query(BpRecord.user_id).filter(
                    BpRecord.measured_at >= seven_days_ago
                ).distinct()
                patients = Patient.query.filter_by(village=doctor.village).filter(
                    ~Patient.user_id.in_(subquery)
                ).all()
            else:  # abnormal
                print(f"目标：{doctor.village}的血压异常患者")
                subquery = db.session.query(
                    BpRecord.user_id,
                    db.func.max(BpRecord.measured_at).label('last_measure')
                ).group_by(BpRecord.user_id).subquery()
                
                abnormal_records = db.session.query(BpRecord).join(
                    subquery,
                    db.and_(
                        BpRecord.user_id == subquery.c.user_id,
                        BpRecord.measured_at == subquery.c.last_measure
                    )
                ).filter(
                    db.or_(
                        BpRecord.systolic >= 140,
                        BpRecord.systolic <= 90,
                        BpRecord.diastolic >= 90,
                        BpRecord.diastolic <= 60
                    )
                ).all()
                
                patient_ids = [record.user_id for record in abnormal_records]
                patients = Patient.query.filter(
                    Patient.user_id.in_(patient_ids),
                    Patient.village == doctor.village
                ).all()
            
            if not patients:
                print(f"错误：未找到符合条件的患者")
                db.session.rollback()
                return jsonify({
                    "error": "未找到符合条件的患者",
                    "detail": f"在{doctor.village}未找到符合{target_type}条件的患者"
                }), 404
            
            print(f"找到 {len(patients)} 名目标患者:")
            for p in patients:
                print(f"- {p.name} (ID: {p.user_id})")
            
        except Exception as e:
            print(f"错误: 查询目标患者失败 - {str(e)}")
            db.session.rollback()
            return jsonify({
                "error": "查询目标患者失败",
                "detail": str(e) if app.debug else "查询目标患者时出错"
            }), 500
        
        # 第四步：为每个患者生成提醒
        success_count = 0
        failed_count = 0
        error_details = []
        
        # 确保static_dir在作用域内
        reminder_static_dir = static_dir
        
        for patient in patients:
            print(f"\n为患者 {patient.name} 生成语音提醒...")
            try:
                # 使用临时文件名避免冲突
                temp_filename = f"temp_{uuid.uuid4().hex}.mp3"
                temp_path = os.path.join(reminder_static_dir, temp_filename)
                final_filename = f"{uuid.uuid4().hex}.mp3"
                final_path = os.path.join(reminder_static_dir, final_filename)
                
                try:
                    # 生成音频文件
                    print(f"正在调用TTS生成语音...")
                    audio_bytes = tts_iflytek(content, voice="xiaoyan", aue="lame")
                    if not audio_bytes:
                        raise Exception("语音生成失败：未获得音频数据")
                    
                    print(f"TTS生成成功，音频大小: {len(audio_bytes)} 字节")
                        
                    # 写入临时文件
                    with open(temp_path, "wb") as f:
                        f.write(audio_bytes)
                    
                    # 检查文件是否成功生成并包含内容
                    if not os.path.exists(temp_path) or os.path.getsize(temp_path) == 0:
                        raise Exception("音频文件生成失败或为空")
                    
                    print(f"临时文件已写入: {temp_path}, 大小: {os.path.getsize(temp_path)} 字节")
                        
                    # 如果目标文件已存在则删除
                    if os.path.exists(final_path):
                        os.remove(final_path)
                        
                    # 重命名为最终文件名
                    os.rename(temp_path, final_path)
                    print(f"音频文件已保存: {final_path}")
                    
                    # 创建患者提醒
                    patient_reminder = PatientReminder(
                        doctor_reminder_id=reminder.id,
                        user_id=patient.user_id,
                        audio_path=f"/static/{final_filename}"
                    )
                    db.session.add(patient_reminder)
                    print(f"已生成提醒记录")
                    success_count += 1
                    
                except Exception as e:
                    # 清理临时文件
                    if 'temp_path' in locals() and os.path.exists(temp_path):
                        try:
                            os.remove(temp_path)
                        except:
                            pass
                    error_msg = f"音频处理失败: {str(e)}"
                    print(f"错误: {error_msg}")
                    raise Exception(error_msg)
                    
            except Exception as e:
                error_msg = f"为患者 {patient.name} 创建提醒失败: {str(e)}"
                print(f"错误: {error_msg}")
                print(f"详细错误堆栈:\n{traceback.format_exc()}")
                error_details.append(error_msg)
                failed_count += 1
                continue
        
        # 提交或回滚事务
        try:
            if success_count > 0:
                db.session.commit()
                print(f"成功为 {success_count} 名患者创建提醒，失败 {failed_count} 个")
                return jsonify({
                    "ok": True,
                    "reminder": reminder.to_dict(),
                    "affected_patients": success_count,
                    "failed_count": failed_count,
                    "error_details": error_details if app.debug else None
                })
            else:
                db.session.rollback()
                print(f"所有提醒创建都失败了，共 {failed_count} 个失败")
                error_msg = "所有提醒创建都失败了"
                if error_details:
                    error_msg += f": {error_details[0] if len(error_details) == 1 else f'共{len(error_details)}个错误'}"
                return jsonify({
                    "ok": False,
                    "error": error_msg,
                    "detail": error_details[0] if error_details else "请稍后重试",
                    "all_errors": error_details if app.debug else None
                }), 500
                
        except Exception as e:
            print(f"错误：提交事务失败 - {str(e)}")
            print(f"详细错误堆栈:\n{traceback.format_exc()}")
            db.session.rollback()
            return jsonify({
                "ok": False,
                "error": "创建提醒失败",
                "detail": str(e) if app.debug else "提交数据时出错"
            }), 500

            
    @app.route("/api/patients/<int:user_id>/reminders", methods=["GET", "OPTIONS"])
    def get_patient_reminders(user_id):
        """获取患者的医生语音提醒列表，支持分页和时间范围控制"""
        try:
            # 处理 OPTIONS 请求
            if request.method == "OPTIONS":
                return jsonify({"ok": True})
                
            print("\n========== 获取患者提醒列表 ==========")
            print(f"患者ID: {user_id}")
            
            # 首先检查患者是否存在
            patient = Patient.query.get(user_id)
            if not patient:
                print(f"错误: 找不到ID为{user_id}的患者")
                return jsonify({
                    "ok": False,
                    "error": f"找不到ID为{user_id}的患者"
                }), 404

            days = request.args.get('days', 7, type=int)
            offset = request.args.get('offset', 0, type=int)
            limit = request.args.get('limit', 20, type=int)
            
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=days)
            
            print(f"查询范围: 最近{days}天 ({cutoff_date} 至今)")
            print(f"分页参数: 偏移={offset}, 数量={limit}")
            
            # 构建基础查询，使用joinedload优化关联查询
            base_query = PatientReminder.query\
                .options(db.joinedload(PatientReminder.doctor_reminder)\
                          .joinedload(DoctorReminder.doctor))\
                .join(DoctorReminder)\
                .join(Doctor, DoctorReminder.doctor_id == Doctor.worker_id)\
                .filter(
                    PatientReminder.user_id == user_id,
                    PatientReminder.created_at >= cutoff_date
                )
            
            try:
                # 首先获取总数
                total = base_query.count()
                print(f"\n找到 {total} 条提醒记录")
                
                # 获取分页数据
                reminders = base_query\
                    .order_by(PatientReminder.created_at.desc())\
                    .offset(offset)\
                    .limit(limit)\
                    .all()
                
                print("\n本页提醒记录:")
                for r in reminders:
                    print(f"- ID: {r.id}")
                    print(f"  医生: {r.doctor_reminder.doctor.name}")
                    print(f"  内容: {r.doctor_reminder.content}")
                    print(f"  时间: {r.created_at}")
                    print(f"  状态: {'已听' if r.is_listened else '未听'}")
                
                # 转换提醒数据
                reminder_list = []
                print("\n提醒记录详情:")
                for r in reminders:
                    try:
                        reminder_dict = r.to_dict()
                        # 添加医生信息
                        doctor = Doctor.query.get(r.doctor_reminder.doctor_id)
                        if doctor:
                            reminder_dict['doctor_name'] = doctor.name
                            print(f"- ID: {r.id}")
                            print(f"  医生: {doctor.name}")
                            print(f"  内容: {r.doctor_reminder.content}")
                            print(f"  创建时间: {r.created_at}")
                            print(f"  状态: {'已听' if r.is_listened else '未听'}")
                        reminder_list.append(reminder_dict)
                    except Exception as e:
                        print(f"转换提醒记录时出错: {str(e)}")
                
                    # 计算是否有更多数据
                has_more = total > (offset + len(reminders))
                print("\n分页信息:")
                print(f"- 总记录数: {total}")
                print(f"- 当前页数量: {len(reminders)}")
                print(f"- 偏移量: {offset}")
                print(f"- 是否有更多: {has_more}")
                print("=================================")
                
                # 准备分页信息
                pagination = {
                    "total": total,
                    "offset": offset,
                    "limit": limit,
                    "has_more": has_more
                }
            except Exception as e:
                print(f"处理提醒数据时出错: {str(e)}")
                raise
            
            # 转换提醒数据为字典格式
            # 转换提醒数据为字典格式，优化关联查询
            reminders_dict = []
            for r in reminders:
                try:
                    reminder_dict = r.to_dict()  # 使用模型的to_dict方法
                    reminders_dict.append(reminder_dict)
                except Exception as e:
                    print(f"转换提醒记录时出错: {str(e)}")
            
            response_data = {
                "ok": True,
                "reminders": reminders_dict,
                "pagination": pagination
            }
            
            return jsonify(response_data)
            
        except Exception as e:
            # 记录错误详情
            print(f"获取患者提醒失败: {str(e)}")
            db.session.rollback()  # 回滚事务
            return jsonify({
                "ok": False,
                "error": "获取提醒失败，请稍后重试",
                "debug_info": str(e) if app.debug else None
            }), 500
        
    @app.route("/api/patients/reminder/<int:reminder_id>/mark_listened", methods=["POST"])
    def mark_reminder_listened(reminder_id):
        """标记提醒为已听"""
        reminder = PatientReminder.query.get(reminder_id)
        if not reminder:
            return jsonify({"error": "提醒不存在"}), 404
            
        reminder.is_listened = True
        db.session.commit()
        
        return jsonify({
            "ok": True,
            "reminder": reminder.to_dict()
        })

    # =========================
    # 聊天消息API
    # =========================
    
    @app.route("/chat/send", methods=["POST", "OPTIONS"])
    @app.route("/api/chat/send", methods=["POST", "OPTIONS"])  # 兼容旧路由
    def send_chat_message():
        """发送聊天消息"""
        # 处理 OPTIONS 请求
        if request.method == "OPTIONS":
            return jsonify({"ok": True})
            
        print("\n========== 发送聊天消息 ==========")
        data = request.get_json(silent=True) or {}
        patient_id = data.get("patient_id")
        doctor_id = data.get("doctor_id")
        sender_type = data.get("sender_type")  # 'patient' or 'doctor'
        content = data.get("content", "").strip()
        
        print(f"发送者类型: {sender_type}")
        print(f"患者ID: {patient_id}")
        print(f"医生ID: {doctor_id}")
        print(f"消息内容: {content}")
        
        if not all([patient_id, doctor_id, sender_type, content]):
            print("错误: 缺少必要参数")
            return jsonify({"error": "缺少必要参数"}), 400
        
        if sender_type not in ['patient', 'doctor']:
            return jsonify({"error": "sender_type必须是'patient'或'doctor'"}), 400
        
        # 验证患者和医生是否存在
        patient = Patient.query.get(patient_id)
        doctor = Doctor.query.get(doctor_id)
        
        if not patient or not doctor:
            return jsonify({"error": "患者或医生不存在"}), 404
        
        # 创建消息
        message = ChatMessage(
            patient_id=patient_id,
            doctor_id=doctor_id,
            sender_type=sender_type,
            content=content
        )
        
        db.session.add(message)
        db.session.commit()
        
        return jsonify({"ok": True, "message": message.to_dict()})
    
    @app.route("/chat/messages", methods=["GET", "OPTIONS"])
    @app.route("/api/chat/messages", methods=["GET", "OPTIONS"])  # 兼容旧路由
    def get_chat_messages():
        """获取聊天消息列表"""
        # 处理 OPTIONS 请求
        if request.method == "OPTIONS":
            return jsonify({"ok": True})
            
        print("\n========== 获取聊天消息列表 ==========")
        patient_id = request.args.get("patient_id", type=int)
        doctor_id = request.args.get("doctor_id", type=int)
        
        print(f"患者ID: {patient_id}")
        print(f"医生ID: {doctor_id}")
        
        if not patient_id or not doctor_id:
            print("错误: 缺少必要参数")
            return jsonify({"error": "缺少必要参数"}), 400
        
        # 查询该患者和医生之间的所有消息
        try:
            messages = ChatMessage.query.filter(
                ChatMessage.patient_id == patient_id,
                ChatMessage.doctor_id == doctor_id
            ).order_by(ChatMessage.created_at.asc()).all()
            
            print(f"找到 {len(messages)} 条消息")
            for msg in messages:
                print(f"- 发送者: {msg.sender_type}")
                print(f"  时间: {msg.created_at}")
                print(f"  内容: {msg.content}")
                print(f"  状态: {'已读' if msg.is_read else '未读'}")
            print("=================================")
            
            return jsonify({"ok": True, "messages": [m.to_dict() for m in messages]})
        except Exception as e:
            print(f"错误: 获取消息失败 - {str(e)}")
            return jsonify({"error": "获取消息失败"}), 500
    
    @app.route("/chat/last_message/<int:patient_id>/<int:doctor_id>", methods=["GET", "OPTIONS"])
    @app.route("/api/chat/last_message/<int:patient_id>/<int:doctor_id>", methods=["GET", "OPTIONS"])  # 兼容旧路由
    def get_last_message(patient_id, doctor_id):
        """获取最后一条消息（用于聊天列表显示）"""
        # 处理 OPTIONS 请求
        if request.method == "OPTIONS":
            return jsonify({"ok": True})
            
        print("\n========== 获取最新消息 ==========")
        print(f"患者ID: {patient_id}")
        print(f"医生ID: {doctor_id}")
        
        last_message = ChatMessage.query.filter(
            ChatMessage.patient_id == patient_id,
            ChatMessage.doctor_id == doctor_id
        ).order_by(ChatMessage.created_at.desc()).first()
        
        if last_message:
            return jsonify({"ok": True, "message": last_message.to_dict()})
        return jsonify({"ok": True, "message": None})
    
    @app.route("/chat/mark_read", methods=["POST", "OPTIONS"])
    @app.route("/api/chat/mark_read", methods=["POST", "OPTIONS"])  # 兼容旧路由
    def mark_messages_read():
        """标记消息为已读"""
        # 处理 OPTIONS 请求
        if request.method == "OPTIONS":
            return jsonify({"ok": True})
            
        print("\n========== 标记消息已读 ==========")
        data = request.get_json(silent=True) or {}
        patient_id = data.get("patient_id")
        doctor_id = data.get("doctor_id")
        sender_type = data.get("sender_type")  # 'patient' or 'doctor'
        
        print(f"患者ID: {patient_id}")
        print(f"医生ID: {doctor_id}")
        print(f"发送者类型: {sender_type}")
        
        if not all([patient_id, doctor_id, sender_type]):
            return jsonify({"error": "缺少必要参数"}), 400
        
        # 标记对方发送的消息为已读
        unread_messages = ChatMessage.query.filter(
            ChatMessage.patient_id == patient_id,
            ChatMessage.doctor_id == doctor_id,
            ChatMessage.sender_type != sender_type,
            ChatMessage.is_read == False
        ).all()
        
        for msg in unread_messages:
            msg.is_read = True
        db.session.commit()
        
        return jsonify({"ok": True, "updated_count": len(unread_messages)})
    
    @app.route("/chat/unread_count", methods=["GET", "OPTIONS"])
    @app.route("/api/chat/unread_count", methods=["GET", "OPTIONS"])  # 兼容旧路由
    def get_unread_count():
        """获取未读消息数量"""
        # 处理 OPTIONS 请求
        if request.method == "OPTIONS":
            return jsonify({"ok": True})
            
        print("\n========== 获取未读消息数量 ==========")
        patient_id = request.args.get("patient_id", type=int)
        doctor_id = request.args.get("doctor_id", type=int)
        sender_type = request.args.get("sender_type")
        
        print(f"患者ID: {patient_id}")
        print(f"医生ID: {doctor_id}")
        print(f"发送者类型: {sender_type}")
        
        if not all([patient_id, doctor_id, sender_type]):
            print("错误: 缺少必要参数")
            return jsonify({"error": "缺少必要参数"}), 400
        
        count = ChatMessage.query.filter(
            ChatMessage.patient_id == patient_id,
            ChatMessage.doctor_id == doctor_id,
            ChatMessage.sender_type != sender_type,
            ChatMessage.is_read == False
        ).count()
        
        return jsonify({"ok": True, "unread_count": count})
    
    @app.route("/patients/<int:user_id>/doctors", methods=["GET"])
    def get_patient_doctors(user_id):
        """获取患者所在村庄的医生列表"""
        try:
            # 获取患者信息
            patient = Patient.query.get(user_id)
            if not patient:
                return jsonify({
                    "ok": False,
                    "error": "找不到患者信息"
                }), 404

            if not patient.village:
                return jsonify({
                    "ok": False,
                    "error": "患者未设置所属村庄"
                }), 400

            # 查询同村医生
            doctors = Doctor.query.filter_by(village=patient.village).all()
            
            print("\n========== 获取医生列表 ==========")
            print(f"患者: {patient.name} (ID: {patient.user_id})")
            print(f"村庄: {patient.village}")
            print(f"找到医生数量: {len(doctors)}")
            for doc in doctors:
                print(f"- {doc.name} (ID: {doc.worker_id}, 角色: {doc.role})")
            print("=================================")
            
            return jsonify({
                "ok": True,
                "doctors": [d.to_dict() for d in doctors],
                "village": patient.village
            })
            
        except Exception as e:
            print(f"获取医生列表时出错: {str(e)}")
            return jsonify({
                "ok": False,
                "error": "获取医生列表失败",
                "debug_info": str(e)
            }), 500
    
    @app.route("/doctors/<int:doctor_id>/patients", methods=["GET"])
    def get_doctor_patients(doctor_id):
        """获取医生所在村庄的患者列表"""
        try:
            # 获取医生信息
            doctor = Doctor.query.get(doctor_id)
            if not doctor:
                return jsonify({
                    "ok": False,
                    "error": "找不到医生信息"
                }), 404

            if not doctor.village:
                return jsonify({
                    "ok": False,
                    "error": "医生未设置所属村庄"
                }), 400

            # 查询同村患者
            patients = Patient.query.filter_by(village=doctor.village)\
                .order_by(Patient.name.asc())\
                .all()
            
            print("\n========== 获取患者列表 ==========")
            print(f"医生: {doctor.name} (ID: {doctor.worker_id})")
            print(f"村庄: {doctor.village}")
            print(f"找到患者数量: {len(patients)}")
            for pat in patients:
                print(f"- {pat.name} (ID: {pat.user_id}, 性别: {pat.gender.value})")
            print("=================================")
            
            return jsonify({
                "ok": True,
                "patients": [p.to_dict() for p in patients],
                "village": doctor.village
            })
            
        except Exception as e:
            print(f"获取患者列表时出错: {str(e)}")
            return jsonify({
                "ok": False,
                "error": "获取患者列表失败",
                "debug_info": str(e)
            }), 500
    
    # =========================
    # 静态文件服务（音频等）
    # =========================
    @app.route("/static/<path:filename>")
    def serve_static(filename):
        """提供静态文件服务（音频文件等）"""
        try:
            file_path = os.path.join(static_dir, filename)
            print(f"\n========== 请求静态文件 ==========")
            print(f"文件名: {filename}")
            print(f"完整路径: {file_path}")
            print(f"文件存在: {os.path.exists(file_path)}")
            print(f"是文件: {os.path.isfile(file_path) if os.path.exists(file_path) else 'N/A'}")
            
            if os.path.exists(file_path) and os.path.isfile(file_path):
                print(f"文件大小: {os.path.getsize(file_path)} 字节")
                response = send_from_directory(static_dir, filename)
                # 确保音频文件有正确的 MIME 类型
                if filename.lower().endswith('.mp3'):
                    response.headers['Content-Type'] = 'audio/mpeg'
                elif filename.lower().endswith('.wav'):
                    response.headers['Content-Type'] = 'audio/wav'
                print(f"返回文件成功")
                return response
            else:
                print(f"错误: 静态文件不存在或不是文件")
                return jsonify({"error": "文件不存在"}), 404
        except Exception as e:
            print(f"错误: 提供静态文件时出错 - {str(e)}")
            print(f"详细错误堆栈:\n{traceback.format_exc()}")
            return jsonify({"error": "服务器错误"}), 500
    
    # =========================
    # 前端静态托管（生产用）
    # =========================
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path):
        # 跳过 /static/ 路径，由上面的路由处理
        if path.startswith("static/"):
            return jsonify({"error": "静态文件路由未匹配"}), 404
        
        file_path = os.path.join(static_dir, path)
        if path and os.path.exists(file_path):
            return send_from_directory(static_dir, path)
        index_file = os.path.join(static_dir, "index.html")
        if os.path.exists(index_file):
            return send_from_directory(static_dir, "index.html")
        return jsonify({"ok": True, "hint": "frontend not built yet"}), 200

    return app



# 检查村庄数据
def check_village_data():
    print("\n检查数据完整性...")
    
    # 检查医生数据
    doctors = Doctor.query.all()
    doctors_without_village = [d for d in doctors if not d.village]
    if doctors_without_village:
        print(f"警告：发现 {len(doctors_without_village)} 名医生未设置所属村庄：")
        for d in doctors_without_village:
            print(f"- 医生ID: {d.worker_id}, 姓名: {d.name}")
    else:
        print(f"医生数据正常，共 {len(doctors)} 名医生")
    
    # 检查患者数据
    patients = Patient.query.all()
    patients_without_village = [p for p in patients if not p.village]
    if patients_without_village:
        print(f"警告：发现 {len(patients_without_village)} 名患者未设置所属村庄：")
        for p in patients_without_village:
            print(f"- 患者ID: {p.user_id}, 姓名: {p.name}")
    else:
        print(f"患者数据正常，共 {len(patients)} 名患者")
    
    # 统计每个村庄的医生和患者数量
    villages = set([d.village for d in doctors if d.village] + [p.village for p in patients if p.village])
    print("\n各村庄统计：")
    for village in sorted(villages):
        doctor_count = len([d for d in doctors if d.village == village])
        patient_count = len([p for p in patients if p.village == village])
        print(f"- {village}：{doctor_count} 名医生，{patient_count} 名患者")

# 直接运行后端

if __name__ == "__main__":
    app = create_app()
    with app.app_context():
        db.create_all()
        # 检查数据完整性
        check_village_data()
        # 初始化演示数据
        if Patient.query.count() == 0:
            demo_patient = Patient(
                name="张大爷", 
                gender=GenderEnum.M, 
                phone="13800000001",
                village="示例村",
                dialect="普通话"
            )
            db.session.add(demo_patient)
            
            demo_patient2 = Patient(
                name="李阿姨", 
                gender=GenderEnum.F, 
                phone="13900000002",
                village="示例村",
                dialect="普通话"
            )
            db.session.add(demo_patient2)
            
        if Doctor.query.count() == 0:
            demo_doctor = Doctor(
                name="王医生",
                role="村医",
                phone="13700000001",
                village="示例村"
            )
            db.session.add(demo_doctor)
            
            demo_doctor2 = Doctor(
                name="刘医生",
                role="主治医师",
                phone="13600000002",
                village="示例村"
            )
            db.session.add(demo_doctor2)
            
        db.session.commit()
    # 确保手机能访问：同一局域网 + 放行防火墙 5000 端口
    app.run(host="0.0.0.0", port=5000, debug=True)
