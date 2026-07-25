import { useEffect, useRef } from 'react';
import { useSQLiteContext } from 'expo-sqlite';
import { IPOService } from '@/services/ipo/ipoService';

export function useIPOEngine() {
  const db = useSQLiteContext();
  const service = useRef<IPOService | null>(null);

  useEffect(() => {
    if (!service.current) {
      service.current = new IPOService(db);
      service.current.startBackgroundUpdates();
    }

    return () => {
      if (service.current) {
        service.current.stopBackgroundUpdates();
        service.current = null;
      }
    };
  }, [db]);
}
