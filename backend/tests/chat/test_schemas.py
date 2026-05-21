import pytest
from app.chat.schemas import SafetyLevel, ToolInput, ToolOutput


def test_safety_level_values():
    assert SafetyLevel.SAFE.value == "safe"
    assert SafetyLevel.RISKY.value == "risky"


def test_tool_input_is_pydantic_base():
    class MyInput(ToolInput):
        name: str
    parsed = MyInput.model_validate({"name": "x"})
    assert parsed.name == "x"


def test_tool_output_serialises_to_dict():
    class MyOutput(ToolOutput):
        count: int
    obj = MyOutput(count=3)
    assert obj.model_dump() == {"count": 3}


def test_tool_input_rejects_extra_fields():
    class MyInput(ToolInput):
        name: str
    with pytest.raises(Exception):
        MyInput.model_validate({"name": "x", "rogue": 1})
