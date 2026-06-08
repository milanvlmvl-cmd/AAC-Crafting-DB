import json
import sqlite3
from validation_rules import validate_import_payload, execute_protected_update, get_item_price

def test_validation():
    print("--- Testing Python Validation Rules ---")
    
    # 1. Test Price Calculation Rule
    print("Testing getItemPrice (Coin ID 500)...")
    price_1_coin = get_item_price(500)
    price_100_coins = get_item_price("500", 100)
    print(f"Price of 1 Coin: {price_1_coin} Gold (Expected: 0.0001)")
    print(f"Price of 100 Coins: {price_100_coins} Gold (Expected: 0.01)")
    assert price_1_coin == 0.0001
    assert price_100_coins == 0.01
    
    # 2. Test JSON Import Payload Rejection
    print("\nTesting validate_import_payload for ID 500 override rejection...")
    good_payload = json.dumps([{"id": 100, "name": "Iron Ore"}, {"id": 101, "name": "Copper Ore"}])
    bad_payload = json.dumps([{"id": 100, "name": "Iron Ore"}, {"id": 500, "name": "Fake Coin", "avg_24h": 99.0}])
    
    # Verify good payload passes
    validated = validate_import_payload(good_payload)
    print("Good payload parsed successfully.")
    
    # Verify bad payload is rejected
    try:
        validate_import_payload(bad_payload)
        raise AssertionError("Failed to reject override payload for ID 500!")
    except ValueError as e:
        print(f"Bad payload successfully rejected with message: {e}")
        
    # 3. Test SQL Update Interception
    print("\nTesting execute_protected_update block for ID 500 database updates...")
    conn = sqlite3.connect(":memory:")
    cursor = conn.cursor()
    cursor.execute("CREATE TABLE test_items (id INTEGER, name TEXT);")
    
    # Try updating a normal item (should pass)
    execute_protected_update(conn, "INSERT INTO test_items (id, name) VALUES (?, ?);", (100, "Iron Ore"))
    print("Normal insert query executed successfully.")
    
    # Try updating Coin ID 500 (should fail)
    try:
        execute_protected_update(conn, "UPDATE test_items SET name = 'Fake Coin' WHERE id = ?;", (500,))
        raise AssertionError("Failed to block database update transaction to ID 500!")
    except PermissionError as e:
        print(f"Database update query successfully intercepted with message: {e}")
        
    conn.close()
    print("\nALL PYTHON VALIDATION RULE TESTS PASSED SUCCESSFULLY!")

if __name__ == '__main__':
    test_validation()
