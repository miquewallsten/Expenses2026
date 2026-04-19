from pydantic import BaseModel


class AssignAccountCodeRequest(BaseModel):
    account_code: str
