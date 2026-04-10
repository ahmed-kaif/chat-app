import asyncio
import json
import websockets
from websockets.exceptions import ConnectionClosed

async def test_ws():
    room_id = "3b933e11-bf74-4f7b-bf18-02a43bbed287"
    # Using the token from the logs
    token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJlMzAwZTk4Mi02MmJjLTRmODYtOTk4Yi1iZjZkNGVkMzdkNzMiLCJleHAiOjE3NzU4MzkwNDgsInR5cGUiOiJhY2Nlc3MifQ.9WVWGA5HMSEjafIpIun0iFjNp_2d7NgtyD60iqDwWCQ"
    url = f"ws://localhost:8000/ws/{room_id}?token={token}"
    try:
        async with websockets.connect(url) as ws:
            print("Connected!")
            msg = {
                "type": "message.send",
                "payload": {"content": "Hello from script", "reply_to_id": None},
                "timestamp": "2026-04-10T00:00:00.000Z"
            }
            await ws.send(json.dumps(msg))
            print("Sent message")
            while True:
                resp = await ws.recv()
                print("Received:", resp)
    except Exception as e:
        print("Error:", e)

asyncio.run(test_ws())
