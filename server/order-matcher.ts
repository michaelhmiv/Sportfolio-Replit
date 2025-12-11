import { storage } from "./storage";
import { broadcast } from "./websocket";

export async function matchOrders(playerId: string): Promise<number> {
  const orderBook = await storage.getOrderBook(playerId);
  const player = await storage.getPlayer(playerId);
  
  if (!player) return 0;

  let totalMatches = 0;
  let lastTradePrice = 0;
  let totalVolume = 0;

  for (const buyOrder of orderBook.bids) {
    if (buyOrder.filledQuantity >= buyOrder.quantity) continue;
    if (buyOrder.status !== "open" && buyOrder.status !== "partial") continue;
    if (!buyOrder.limitPrice) continue;

    for (const sellOrder of orderBook.asks) {
      if (sellOrder.filledQuantity >= sellOrder.quantity) continue;
      if (sellOrder.status !== "open" && sellOrder.status !== "partial") continue;
      if (!sellOrder.limitPrice) continue;

      const buyPrice = parseFloat(buyOrder.limitPrice);
      const sellPrice = parseFloat(sellOrder.limitPrice);
      
      if (buyPrice >= sellPrice) {
        const remainingBuy = buyOrder.quantity - buyOrder.filledQuantity;
        const remainingSell = sellOrder.quantity - sellOrder.filledQuantity;
        const tradeQuantity = Math.min(remainingBuy, remainingSell);
        const tradePrice = sellPrice;

        await storage.createTrade({
          playerId,
          buyerId: buyOrder.userId,
          sellerId: sellOrder.userId,
          buyOrderId: buyOrder.id,
          sellOrderId: sellOrder.id,
          quantity: tradeQuantity,
          price: tradePrice.toFixed(2),
        });

        const newBuyFilled = buyOrder.filledQuantity + tradeQuantity;
        const newSellFilled = sellOrder.filledQuantity + tradeQuantity;
        const buyOrderStatus = newBuyFilled >= buyOrder.quantity ? "filled" : "partial";
        const sellOrderStatus = newSellFilled >= sellOrder.quantity ? "filled" : "partial";

        await storage.updateOrder(buyOrder.id, {
          filledQuantity: newBuyFilled,
          status: buyOrderStatus,
        });

        await storage.updateOrder(sellOrder.id, {
          filledQuantity: newSellFilled,
          status: sellOrderStatus,
        });

        buyOrder.filledQuantity = newBuyFilled;
        buyOrder.status = buyOrderStatus;
        sellOrder.filledQuantity = newSellFilled;
        sellOrder.status = sellOrderStatus;

        const remainingSellLocked = sellOrder.quantity - newSellFilled;
        await storage.adjustLockQuantity(sellOrder.id, remainingSellLocked);
        
        const remainingBuyQuantity = buyOrder.quantity - newBuyFilled;
        const buyLimitPrice = parseFloat(buyOrder.limitPrice || "0");
        const remainingBuyLocked = (remainingBuyQuantity * buyLimitPrice).toFixed(2);
        await storage.adjustLockAmount(buyOrder.id, remainingBuyLocked);

        const buyerHolding = await storage.getHolding(buyOrder.userId, "player", playerId);
        if (buyerHolding) {
          const newQuantity = buyerHolding.quantity + tradeQuantity;
          const newTotalCost = parseFloat(buyerHolding.totalCostBasis) + (tradeQuantity * tradePrice);
          const newAvgCost = newTotalCost / newQuantity;
          await storage.updateHolding(buyOrder.userId, "player", playerId, newQuantity, newAvgCost.toFixed(4));
        } else {
          await storage.updateHolding(buyOrder.userId, "player", playerId, tradeQuantity, tradePrice.toFixed(4));
        }

        const sellerHolding = await storage.getHolding(sellOrder.userId, "player", playerId);
        if (sellerHolding) {
          const newQuantity = sellerHolding.quantity - tradeQuantity;
          await storage.updateHolding(sellOrder.userId, "player", playerId, newQuantity, sellerHolding.avgCostBasis);
        }

        const buyer = await storage.getUser(buyOrder.userId);
        const seller = await storage.getUser(sellOrder.userId);
        
        if (buyer && seller) {
          const tradeCost = tradeQuantity * tradePrice;
          await storage.updateUserBalance(buyOrder.userId, (parseFloat(buyer.balance) - tradeCost).toFixed(2));
          await storage.updateUserBalance(sellOrder.userId, (parseFloat(seller.balance) + tradeCost).toFixed(2));

          broadcast({
            type: "trade",
            playerId,
            price: tradePrice.toFixed(2),
            quantity: tradeQuantity,
            buyerId: buyOrder.userId,
            sellerId: sellOrder.userId,
          });

          const updatedBuyer = await storage.getUser(buyOrder.userId);
          const updatedSeller = await storage.getUser(sellOrder.userId);
          if (updatedBuyer) {
            broadcast({ type: "portfolio", userId: buyOrder.userId, balance: updatedBuyer.balance });
          }
          if (updatedSeller) {
            broadcast({ type: "portfolio", userId: sellOrder.userId, balance: updatedSeller.balance });
          }
        }

        lastTradePrice = tradePrice;
        totalVolume += tradeQuantity;
        totalMatches++;

        if (buyOrder.filledQuantity >= buyOrder.quantity) break;
      }
    }
  }

  if (totalMatches > 0 && lastTradePrice > 0) {
    // Calculate totalShares and marketCap
    const totalShares = await storage.getTotalSharesForPlayer(playerId);
    const marketCap = totalShares * lastTradePrice;
    
    // Calculate priceChange24h by comparing to price 24h ago
    const price24hAgo = await storage.getPrice24hAgo(playerId);
    let priceChange24h = 0;
    if (price24hAgo !== null && price24hAgo > 0) {
      priceChange24h = lastTradePrice - price24hAgo;
    }
    
    await storage.upsertPlayer({
      ...player,
      currentPrice: lastTradePrice.toFixed(2),
      lastTradePrice: lastTradePrice.toFixed(2),
      volume24h: player.volume24h + totalVolume,
      totalShares,
      marketCap: marketCap.toFixed(2),
      priceChange24h: priceChange24h.toFixed(2),
    });

    broadcast({ type: "orderBook", playerId });
    broadcast({ type: "marketActivity" });
  }

  return totalMatches;
}

export async function placeBotLimitOrder(
  userId: string,
  playerId: string,
  side: "buy" | "sell",
  quantity: number,
  price: number
): Promise<{ orderId: string | null; matchedTrades: number }> {
  try {
    const user = await storage.getUser(userId);
    if (!user) {
      return { orderId: null, matchedTrades: 0 };
    }

    if (side === "buy") {
      const cost = quantity * price;
      const availableBalance = await storage.getAvailableBalance(userId);
      if (availableBalance < cost) {
        return { orderId: null, matchedTrades: 0 };
      }
    } else {
      const availableShares = await storage.getAvailableShares(userId, "player", playerId);
      if (availableShares < quantity) {
        return { orderId: null, matchedTrades: 0 };
      }
    }

    const order = await storage.createOrder({
      userId,
      playerId,
      orderType: "limit",
      side,
      quantity,
      limitPrice: price.toFixed(2),
      status: "open",
    });

    if (side === "sell") {
      await storage.reserveShares(userId, "player", playerId, "order", order.id, quantity);
    } else {
      const lockAmount = (quantity * price).toFixed(2);
      await storage.reserveCash(userId, "order", order.id, lockAmount);
    }

    const matchedTrades = await matchOrders(playerId);

    return { orderId: order.id, matchedTrades };
  } catch (error: any) {
    console.error(`[OrderMatcher] Failed to place ${side} order:`, error.message);
    return { orderId: null, matchedTrades: 0 };
  }
}
