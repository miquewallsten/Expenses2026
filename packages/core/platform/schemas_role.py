from datetime import datetime

from pydantic import BaseModel, ConfigDict


class RoleCreate(BaseModel):
    company_id: int
    key: str
    name: str
    description: str


class RoleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    key: str
    name: str
    description: str
    created_at: datetime


class PermissionCreate(BaseModel):
    key: str
    name: str
    description: str


class PermissionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    key: str
    name: str
    description: str
    created_at: datetime


class RolePermissionCreate(BaseModel):
    role_id: int
    permission_id: int


class UserRoleCreate(BaseModel):
    user_id: int
    role_id: int
