'use client';

import React, { createContext, useContext, useState } from 'react';

type SidebarContextType = {
    isOpen: boolean;
    isCollapsed: boolean;
    toggle: () => void;
    close: () => void;
    toggleCollapse: () => void;
};

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);

    const toggle = () => setIsOpen((prev) => !prev);
    const close = () => setIsOpen(false);
    const toggleCollapse = () => setIsCollapsed((prev) => !prev);

    return (
        <SidebarContext.Provider value={{ isOpen, isCollapsed, toggle, close, toggleCollapse }}>
            {children}
        </SidebarContext.Provider>
    );
}

export function useSidebar() {
    const context = useContext(SidebarContext);
    if (context === undefined) {
        throw new Error('useSidebar must be used within a SidebarProvider');
    }
    return context;
}
