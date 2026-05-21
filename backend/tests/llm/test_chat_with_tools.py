import os
import pytest
from app.llm.provider import chat_with_tools, ToolDecl

pytestmark = pytest.mark.skipif(
    os.getenv("SKIP_LIVE_LLM_TESTS") == "1" or not os.getenv("GEMINI_API_KEY"),
    reason="Live Gemini test; set GEMINI_API_KEY and SKIP_LIVE_LLM_TESTS=0 to enable",
)


def test_model_invokes_list_nodes():
    tools = [ToolDecl(
        name="list_nodes",
        description="List nodes with optional status filter.",
        parameters_schema={
            "type": "object",
            "properties": {
                "status": {"type": "string",
                           "enum": ["critical", "degraded", "healthy", "offline"]},
            },
            "additionalProperties": False,
        },
    )]
    response = chat_with_tools(
        messages=[{"role": "user", "content": "Show me the critical nodes."}],
        tools=tools,
        model="gemini-2.5-flash",
        api_key=os.environ["GEMINI_API_KEY"],
    )
    assert response.tool_calls, "expected the model to call list_nodes"
    call = response.tool_calls[0]
    assert call.name == "list_nodes"
    assert call.args.get("status") == "critical"
