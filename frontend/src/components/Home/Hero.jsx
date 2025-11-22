import React from 'react';
import { ArrowRight } from 'lucide-react';
import Button from '../ui/compatibility-button';

const Hero = () => {
  return (
    <section className="relative pt-28 pb-20 md:pt-36 md:pb-28 overflow-hidden">
      {/* Background gradient */}
      <div className="absolute top-0 inset-x-0 h-96 bg-gradient-to-b from-primary-50 to-transparent dark:from-primary-900/10 dark:to-transparent"></div>
      
      {/* Content container */}
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left column - Text content */}
          <div className="max-w-xl space-y-6 animate-slide-up">
            <div className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
              Exclusive for FAST NUCES students
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-balance">
              <span className="block">Share rides, save money,</span>
              <span className="bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">
                connect with peers
              </span>
            </h1>
            
            <p className="text-lg text-muted-foreground max-w-lg">
              Join the FAST NUCES carpooling community. Find reliable rides with fellow students, 
              reduce commuting costs, and make your daily journey more sustainable.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              <Button size="lg">
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
              <Button variant="outline" size="lg">
                Find a Ride
              </Button>
            </div>
            
            <div className="grid grid-cols-3 gap-8 pt-8 border-t border-border">
              <div>
                <p className="text-3xl font-bold">500+</p>
                <p className="text-sm text-muted-foreground">Active users</p>
              </div>
              <div>
                <p className="text-3xl font-bold">2,000+</p>
                <p className="text-sm text-muted-foreground">Rides shared</p>
              </div>
              <div>
                <p className="text-3xl font-bold">₨150K+</p>
                <p className="text-sm text-muted-foreground">Monthly savings</p>
              </div>
            </div>
          </div>
          
          {/* Right column - Image/illustration */}
          <div className="relative lg:h-[540px] animate-fade-in">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] rounded-full bg-primary/5 animate-pulse"></div>
            
            {/* Main card */}
            <div className="relative glass-card p-6 rounded-xl shadow-elevated max-w-md mx-auto lg:ml-auto animate-float">
              <div className="flex items-start space-x-4">
                <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
                    <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.5 2.8C1.4 11.3 1 12.1 1 13v3c0 .6.4 1 1 1h2"></path>
                    <circle cx="7" cy="17" r="2"></circle>
                    <path d="M9 17h6"></path>
                    <circle cx="17" cy="17" r="2"></circle>
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-medium mb-1">Daily Commute to FAST</h3>
                  <p className="text-sm text-muted-foreground mb-3">Mon-Fri, 8:30 AM - 4:30 PM</p>
                  <div className="flex items-center text-sm text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-2"></span>
                    3 seats available
                  </div>
                </div>
              </div>
            </div>
            
            {/* Secondary floating cards */}
            <div className="absolute top-1/4 left-0 glass-card p-4 rounded-lg max-w-[200px] animate-float" style={{animationDelay: "1s"}}>
              <div className="flex items-center space-x-3 mb-2">
                <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"></path>
                    <path d="m9 12 2 2 4-4"></path>
                  </svg>
                </div>
                <p className="text-sm font-medium">Ride Confirmed!</p>
              </div>
              <p className="text-xs text-muted-foreground">Your carpool has been confirmed for tomorrow at 8:00 AM.</p>
            </div>
            
            <div className="absolute bottom-1/4 right-0 glass-card p-4 rounded-lg max-w-[220px] animate-float" style={{animationDelay: "1.5s"}}>
              <div className="flex items-center space-x-2 mb-2">
                <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium">₨850 Saved</p>
                  <p className="text-xs text-muted-foreground">This month</p>
                </div>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div className="bg-primary h-1.5 rounded-full" style={{width: '75%'}}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
