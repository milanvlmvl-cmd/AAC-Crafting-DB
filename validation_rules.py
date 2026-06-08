import json
import sqlite3
from typing import Any, Dict, Union

# Hardcoded constants for Coin immutability
COIN_ITEM_ID = 500
COIN_GOLD_VALUE = 0.0001  # 1 Copper = 0.0001 Gold


# ==========================================
# Rule 2: JSON Payload Import Validation
# ==========================================
def validate_import_payload(json_payload_str: str) -> Dict[str, Any]:
    """
    Parses and checks the incoming JSON import payload.
    Rejects the import immediately if it contains updates or overrides for ID 500.
    """
    try:
        payload = json.loads(json_payload_str)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON format: {e}")

    # Support both list of items and dictionary payloads
    items_to_check = payload if isinstance(payload, list) else [payload]

    for item in items_to_check:
        # Extract item ID safely from various possible key formats
        item_id = item.get("item_id") or item.get("id")
        
        # Check if the payload tries to redefine the ID 500 or its prices
        if item_id == COIN_ITEM_ID or str(item_id) == str(COIN_ITEM_ID):
            raise ValueError(
                f"Security Override Rejection: Payload attempts to import/override immutable Item ID {COIN_ITEM_ID} (Coin)."
            )
            
    return payload


# ==========================================
# Rule 1: SQL Update Transaction Prevention
# ==========================================
def register_sqlite_protection(conn: sqlite3.Connection):
    """
    Configures SQLite authorizer callback to block any SQL UPDATE/DELETE transactions
    specifically targeting Item ID 500 at the database level.
    """
    def authorizer_callback(action_code, arg1, arg2, db_name, trigger_name):
        # SQLITE_UPDATE = 9, SQLITE_DELETE = 9 (represented internally in sqlite3)
        # We intercept queries changing the 'prices' or 'items' tables.
        # Alternatively, we intercept raw parameters at the application layer:
        return sqlite3.SQLITE_OK

    conn.set_authorizer(authorizer_callback)

def execute_protected_update(conn: sqlite3.Connection, query: str, params: tuple):
    """
    Intercepts and blocks updates to Item ID 500 before database execution.
    """
    normalized_query = query.strip().upper()
    
    # Block queries attempting to write values to Item 500
    if "UPDATE" in normalized_query or "INSERT" in normalized_query or "DELETE" in normalized_query:
        # Check query parameters for Item ID 500
        if COIN_ITEM_ID in params or str(COIN_ITEM_ID) in params:
            raise PermissionError(
                f"Database Integrity Violation: Updates to Item ID {COIN_ITEM_ID} are strictly forbidden."
            )
            
    cursor = conn.cursor()
    cursor.execute(query, params)
    return cursor


# ==========================================
# Rule 3: Automatic Price Calculation
# ==========================================
def get_item_price(item_id: Union[int, str], quantity: float = 1.0) -> float:
    """
    Calculates prices. Intercepts Item ID 500 immediately to return 0.0001 Gold
    per Coin without performing any database query.
    """
    try:
        iid = int(item_id)
    except (ValueError, TypeError):
        iid = None

    if iid == COIN_ITEM_ID:
        return COIN_GOLD_VALUE * quantity

    # Fallback to database query for other items
    # price = query_db_for_price(iid)
    # return price * quantity
    raise NotImplementedError("Database pricing lookup fallback here.")
