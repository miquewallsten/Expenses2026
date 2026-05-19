from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, func
from apps.api.db import Base

class PlatformSettings(Base):
    __tablename__ = "platform_settings"

    id = Column(Integer, primary_key=True)
    # Corporate Mail Config (Incoming/Outgoing)
    smtp_host = Column(String(255))
    smtp_port = Column(Integer, default=587)
    smtp_user = Column(String(255))
    smtp_password = Column(String(255))
    smtp_from_name = Column(String(255), default="Financial Ops Support")
    smtp_from_email = Column(String(255), default="support@financial-ops.local")
    
    # Incoming Mail (IMAP)
    imap_host = Column(String(255))
    imap_port = Column(Integer, default=993)
    imap_user = Column(String(255))
    imap_password = Column(String(255))
    imap_enabled = Column(Boolean, default=False)
    
    # WhatsApp Business API
    whatsapp_business_id = Column(String(255))
    whatsapp_phone_number_id = Column(String(255))
    whatsapp_access_token = Column(String(512))
    whatsapp_webhook_verify_token = Column(String(255))
    whatsapp_webhook_secret = Column(String(255))
    whatsapp_enabled = Column(Boolean, default=False)
    whatsapp_default_language = Column(String(5), default="es")
    whatsapp_instructions = Column(Text, nullable=True)
    
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
