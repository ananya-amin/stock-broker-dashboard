import { useEffect, useState } from 'react';
import { socket } from '../api';

type Prices = Record<string, { price: number; updatedAt: number }>;

export function usePrices() {
  const [prices, setPrices] = useState<Prices>({}); // ✅ NEVER undefined

  useEffect(() => {
    function onInit(data: Prices) {
      setPrices(data || {});
    }

    function onUpdate(data: Prices) {
      setPrices(data || {});
    }

    socket.on('prices:init', onInit);
    socket.on('prices:update', onUpdate);

    return () => {
      socket.off('prices:init', onInit);
      socket.off('prices:update', onUpdate);
    };
  }, []);

  return prices;
}
