// Hardcoded constants for Coin immutability
const COIN_ITEM_ID = 500;
const COIN_GOLD_VALUE = 0.0001; // 1 Copper = 0.0001 Gold

/**
 * Rule 2: JSON Payload Import Validation
 * Parses and validates raw JSON payload inputs.
 * Rejects payload if an override for ID 500 is detected.
 */
function validateImportPayload(jsonPayloadStr) {
  let payload;
  try {
    payload = JSON.parse(jsonPayloadStr);
  } catch (err) {
    throw new Error(`Invalid JSON format: ${err.message}`);
  }

  const itemsToCheck = Array.isArray(payload) ? payload : [payload];

  for (const item of itemsToCheck) {
    const itemId = item.item_id !== undefined ? item.item_id : item.id;
    
    if (itemId === COIN_ITEM_ID || String(itemId) === String(COIN_ITEM_ID)) {
      throw new Error(
        `Security Override Rejection: Payload attempts to import/override immutable Item ID ${COIN_ITEM_ID} (Coin).`
      );
    }
  }

  return payload;
}

/**
 * Rule 1: Database/SQL Update Transaction Prevention
 * Intercepts update query requests to block modifications to Item ID 500.
 */
function executeProtectedUpdate(dbConnection, query, params = []) {
  const normalizedQuery = query.trim().toUpperCase();

  const isWriteQuery = 
    normalizedQuery.includes("UPDATE") || 
    normalizedQuery.includes("INSERT") || 
    normalizedQuery.includes("DELETE");

  if (isWriteQuery) {
    // Look for ID 500 in parameters
    const targetsCoin = params.some(param => 
      param === COIN_ITEM_ID || String(param) === String(COIN_ITEM_ID)
    );

    if (targetsCoin) {
      throw new Error(
        `Database Integrity Violation: Updates to Item ID ${COIN_ITEM_ID} are strictly forbidden.`
      );
    }
  }

  return dbConnection.execute(query, params);
}

/**
 * Rule 3: Automatic Price Calculation
 * Calculates prices. Returns exactly 0.0001 Gold for Coin (ID 500)
 * immediately without performing external database lookups.
 */
function getItemPrice(itemId, quantity = 1.0) {
  const parsedId = parseInt(itemId, 10);

  if (parsedId === COIN_ITEM_ID) {
    return COIN_GOLD_VALUE * quantity;
  }

  // Fallback to database query for other items
  // return queryDbForPrice(parsedId) * quantity;
  throw new Error("Database pricing lookup fallback here.");
}
