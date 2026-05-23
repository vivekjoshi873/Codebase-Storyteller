from uuid import UUID

from pydantic import BaseModel, Field


class IngestRequest(BaseModel):
    url: str = Field(..., min_length=1)


class IngestResponse(BaseModel):
    repo_id: UUID
    status: str
    graph: dict


class RepoStatusResponse(BaseModel):
    repo_id: UUID
    status: str
    graph: dict
    error: str | None = None


class QueryRequest(BaseModel):
    q: str = Field(..., min_length=1)
    repo_id: UUID
