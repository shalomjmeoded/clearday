import React, { createContext, useContext } from 'react';

const BottomBarInsetContext = createContext<number>(0);

export function BottomBarInsetProvider({
  inset,
  children,
}: {
  inset: number;
  children: React.ReactNode;
}) {
  return (
    <BottomBarInsetContext.Provider value={inset}>
      {children}
    </BottomBarInsetContext.Provider>
  );
}

/** List/scroll padding when rendered inside ScreenWithBottomBar. */
export function useBottomBarContentInset(): number {
  return useContext(BottomBarInsetContext);
}
