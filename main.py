"""
学祭ピザ屋 呼び出し＆注文管理システム
FastAPI + WebSocket + リアルタイム同期
"""
import json
import os
import asyncio
from typing import List, Dict, Any, Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Header, Depends
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="学祭ピザ呼び出しベル")

DATA_FILE = os.path.join(os.path.dirname(__file__), "data.json")

# デフォルト設定とメニュー
DEFAULT_DATA = {
    "menu": [
        {"id": "margherita", "name": "マルゲリータ", "piece_price": 300, "whole_price": 1200, "category": "savory"},
        {"id": "marinara", "name": "マリナーラ", "piece_price": 250, "whole_price": 1000, "category": "savory"},
        {"id": "marshmallow", "name": "チョコマシュマロ", "piece_price": 350, "whole_price": 1400, "category": "sweet"},
        {"id": "apple", "name": "リンゴピザ", "piece_price": 350, "whole_price": 1400, "category": "sweet"},
    ],
    "orders": [], # List of orders
    "settings": {
        "shop_name": "学祭ピザスタンド",
        "staff_pin": os.environ.get("STAFF_PIN", "7788"), # スタッフ管理用PIN（デフォルト: 7788）
        "max_calling_cards": 30
    }
}

def load_data() -> Dict[str, Any]:
    if not os.path.exists(DATA_FILE):
        save_data(DEFAULT_DATA)
        return DEFAULT_DATA.copy()
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if "menu" not in data:
                data["menu"] = DEFAULT_DATA["menu"]
            if "orders" not in data:
                data["orders"] = []
            if "settings" not in data:
                data["settings"] = DEFAULT_DATA["settings"]
            elif "staff_pin" not in data["settings"]:
                data["settings"]["staff_pin"] = os.environ.get("STAFF_PIN", "7788")
            return data
    except Exception as e:
        print(f"Error loading data: {e}")
        return DEFAULT_DATA.copy()

def save_data(data: Dict[str, Any]):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# --- スタッフ認証用依存関係 ---
def verify_staff_pin(x_staff_pin: Optional[str] = Header(None)):
    data = load_data()
    correct_pin = data.get("settings", {}).get("staff_pin", "7788")
    if not x_staff_pin or x_staff_pin != str(correct_pin):
        raise HTTPException(status_code=401, detail="スタッフPINコードが正しくありません")
    return True

# WebSocketマネージャー
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)

manager = ConnectionManager()

# --- Pydantic Models ---
class OrderItem(BaseModel):
    pizza_id: str
    pizza_name: str
    size: str # "piece" or "whole"
    quantity: int
    unit_price: int

class CreateOrderRequest(BaseModel):
    number: int
    items: List[OrderItem]
    note: Optional[str] = ""

class UpdateStatusRequest(BaseModel):
    status: str # "waiting", "calling", "completed", "cancelled"

class UpdateMenuRequest(BaseModel):
    menu: List[Dict[str, Any]]

# --- API Endpoints ---

@app.get("/api/state")
def get_state():
    data = load_data()
    # セキュリティのためレスポンスからstaff_pinは除外
    safe_data = {
        "menu": data["menu"],
        "orders": data["orders"],
        "settings": {
            "shop_name": data["settings"].get("shop_name", "学祭ピザスタンド"),
            "max_calling_cards": data["settings"].get("max_calling_cards", 30)
        }
    }
    return safe_data

@app.post("/api/verify_pin")
def verify_pin_endpoint(x_staff_pin: Optional[str] = Header(None)):
    verify_staff_pin(x_staff_pin)
    return {"status": "ok", "message": "認証成功"}

@app.post("/api/change_pin")
def change_pin_endpoint(req: Dict[str, str], x_staff_pin: Optional[str] = Header(None)):
    verify_staff_pin(x_staff_pin)
    new_pin = req.get("new_pin", "").strip()
    if not new_pin or len(new_pin) < 4:
        raise HTTPException(status_code=400, detail="PINは4文字以上で設定してください")
    data = load_data()
    data["settings"]["staff_pin"] = new_pin
    save_data(data)
    return {"status": "ok", "message": "PINコードを変更しました"}

@app.post("/api/menu")
async def update_menu(req: UpdateMenuRequest, authorized: bool = Depends(verify_staff_pin)):
    data = load_data()
    data["menu"] = req.menu
    save_data(data)
    await manager.broadcast({"type": "menu_updated", "menu": data["menu"]})
    return {"status": "ok", "menu": data["menu"]}

@app.post("/api/orders")
async def create_order(req: CreateOrderRequest, authorized: bool = Depends(verify_staff_pin)):
    data = load_data()
    
    # 同じ番号で現在「waiting」または「calling」があるかチェック
    for o in data["orders"]:
        if o["number"] == req.number and o["status"] in ["waiting", "calling"]:
            raise HTTPException(status_code=400, detail=f"番号 {req.number} は現在調理中または呼出中です。別の番号を選択してください。")
    
    total_price = sum(item.quantity * item.unit_price for item in req.items)
    
    new_order = {
        "id": f"ord_{int(asyncio.get_event_loop().time() * 1000)}_{req.number}",
        "number": req.number,
        "items": [item.model_dump() for item in req.items],
        "total_price": total_price,
        "status": "waiting", # waiting -> calling -> completed
        "created_at": int(asyncio.get_event_loop().time()),
        "called_at": None,
        "completed_at": None,
        "note": req.note or ""
    }
    
    data["orders"].append(new_order)
    save_data(data)
    
    await manager.broadcast({"type": "order_created", "order": new_order})
    return new_order

@app.post("/api/orders/{order_id}/status")
async def update_order_status(order_id: str, req: UpdateStatusRequest, authorized: bool = Depends(verify_staff_pin)):
    data = load_data()
    target_order = None
    for o in data["orders"]:
        if o["id"] == order_id:
            target_order = o
            break
            
    if not target_order:
        raise HTTPException(status_code=404, detail="注文が見つかりません")
        
    old_status = target_order["status"]
    target_order["status"] = req.status
    now_ts = int(asyncio.get_event_loop().time())
    
    if req.status == "calling":
        target_order["called_at"] = now_ts
    elif req.status == "completed":
        target_order["completed_at"] = now_ts
        
    save_data(data)
    
    await manager.broadcast({
        "type": "order_updated",
        "order": target_order,
        "old_status": old_status
    })
    return target_order

@app.delete("/api/orders/{order_id}")
async def delete_order(order_id: str, authorized: bool = Depends(verify_staff_pin)):
    data = load_data()
    data["orders"] = [o for o in data["orders"] if o["id"] != order_id]
    save_data(data)
    await manager.broadcast({"type": "order_deleted", "order_id": order_id})
    return {"status": "ok"}

@app.post("/api/reset_orders")
async def reset_orders(authorized: bool = Depends(verify_staff_pin)):
    """本日の注文をリセット（開発・テスト用、または翌日用）"""
    data = load_data()
    data["orders"] = []
    save_data(data)
    await manager.broadcast({"type": "orders_reset"})
    return {"status": "ok"}

# --- WebSocket ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            # クライアントからのpingまたはメッセージ受信
            data = await websocket.receive_text()
            # 必要ならpong応答
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)

# 静的ファイルの提供
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def get_index():
    with open(os.path.join(STATIC_DIR, "index.html"), "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/call")
def get_call_page():
    with open(os.path.join(STATIC_DIR, "call.html"), "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/display")
def get_display_page():
    with open(os.path.join(STATIC_DIR, "display.html"), "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/cards")
def get_cards_page():
    with open(os.path.join(STATIC_DIR, "cards.html"), "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

@app.get("/manual")
def get_manual_page():
    with open(os.path.join(STATIC_DIR, "manual.html"), "r", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
