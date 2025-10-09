import React from "react";

export const AnimatedBackground = () => {
    return (
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {/* Base gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-background" />
        
        {/* Animated gradient orbs */}
        <div className="absolute top-0 -left-1/4 w-1/2 h-1/2 bg-accent/20 rounded-full blur-[120px] animate-pulse" 
             style={{ animationDuration: '4s' }} />
        <div className="absolute top-1/4 right-0 w-1/3 h-1/3 bg-primary/20 rounded-full blur-[100px] animate-pulse" 
             style={{ animationDuration: '5s', animationDelay: '1s' }} />
        <div className="absolute bottom-0 left-1/3 w-1/2 h-1/2 bg-primary/15 rounded-full blur-[130px] animate-pulse" 
             style={{ animationDuration: '6s', animationDelay: '2s' }} />
        <div className="absolute bottom-1/4 -right-1/4 w-1/3 h-1/3 bg-accent/15 rounded-full blur-[110px] animate-pulse" 
             style={{ animationDuration: '7s', animationDelay: '0.5s' }} />
        
        {/* Floating glowing particles */}
        <div className="absolute top-[10%] left-[15%] w-3 h-3 bg-accent rounded-full blur-sm animate-float" 
             style={{ animationDuration: '8s', animationDelay: '0s' }} />
        <div className="absolute top-[60%] left-[25%] w-2 h-2 bg-primary rounded-full blur-sm animate-float" 
             style={{ animationDuration: '10s', animationDelay: '2s' }} />
        <div className="absolute top-[30%] right-[20%] w-4 h-4 bg-accent/80 rounded-full blur-sm animate-float" 
             style={{ animationDuration: '12s', animationDelay: '1s' }} />
        <div className="absolute bottom-[40%] right-[35%] w-2 h-2 bg-primary/80 rounded-full blur-sm animate-float" 
             style={{ animationDuration: '9s', animationDelay: '3s' }} />
        <div className="absolute top-[80%] left-[45%] w-3 h-3 bg-accent/60 rounded-full blur-sm animate-float" 
             style={{ animationDuration: '11s', animationDelay: '1.5s' }} />
        <div className="absolute top-[20%] right-[40%] w-2 h-2 bg-primary/70 rounded-full blur-sm animate-float" 
             style={{ animationDuration: '13s', animationDelay: '0.5s' }} />
        <div className="absolute bottom-[20%] left-[60%] w-3 h-3 bg-accent/70 rounded-full blur-sm animate-float" 
             style={{ animationDuration: '10s', animationDelay: '2.5s' }} />
        <div className="absolute top-[50%] left-[70%] w-2 h-2 bg-primary/60 rounded-full blur-sm animate-float" 
             style={{ animationDuration: '14s', animationDelay: '1s' }} />
        
        {/* Subtle overlay gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-background/50" />
      </div>
    );
  };
  