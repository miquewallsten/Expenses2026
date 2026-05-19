from fastapi import APIRouter

from .companies import router as companies_router
from .users import router as users_router
from .channels import router as channels_router
from .access import router as access_router

router = APIRouter()

router.include_router(companies_router)
router.include_router(users_router)
router.include_router(channels_router)
router.include_router(access_router)
