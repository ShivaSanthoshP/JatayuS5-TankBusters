import asyncio
import pytest
from app.chat.confirm_store import ConfirmStore, PendingDecision


@pytest.mark.asyncio
async def test_create_then_resolve_run():
    store = ConfirmStore(ttl_seconds=60)
    cid = store.create(session_id="s1", tool="x", args={"a": 1}, summary="do x")
    assert store.get(cid) is not None

    async def resolver():
        await asyncio.sleep(0.01)
        assert store.resolve(cid, session_id="s1", decision="run") is True

    decision = await asyncio.wait_for(
        asyncio.gather(store.wait_for_decision(cid), resolver()),
        timeout=1.0,
    )
    assert decision[0] == PendingDecision.RUN


@pytest.mark.asyncio
async def test_cancel_path():
    store = ConfirmStore(ttl_seconds=60)
    cid = store.create(session_id="s1", tool="x", args={}, summary="x")

    async def resolver():
        store.resolve(cid, session_id="s1", decision="cancel")

    decision = (await asyncio.gather(store.wait_for_decision(cid), resolver()))[0]
    assert decision == PendingDecision.CANCEL


def test_wrong_session_rejected():
    store = ConfirmStore(ttl_seconds=60)
    cid = store.create(session_id="s1", tool="x", args={}, summary="x")
    assert store.resolve(cid, session_id="s2", decision="run") is False


def test_single_use():
    store = ConfirmStore(ttl_seconds=60)
    cid = store.create(session_id="s1", tool="x", args={}, summary="x")
    assert store.resolve(cid, session_id="s1", decision="run") is True
    assert store.resolve(cid, session_id="s1", decision="run") is False
