import React from 'react';
import { CheckCircle2, MapPin, Calendar, Users } from 'lucide-react';
import Button from '../ui/compatibility-button';

const HowItWorks = () => {
  const steps = [
    {
      icon: <CheckCircle2 className="h-8 w-8 text-primary" />,
      title: "Create Your Account",
      description: "Sign up using your university email and complete your profile with travel preferences."
    },
    {
      icon: <MapPin className="h-8 w-8 text-primary" />,
      title: "Find or Offer Rides",
      description: "Search for available carpools or create your own to share your journey with others."
    },
    {
      icon: <Calendar className="h-8 w-8 text-primary" />,
      title: "Schedule Your Trips",
      description: "Set up one-time or recurring rides based on your university schedule."
    },
    {
      icon: <Users className="h-8 w-8 text-primary" />,
      title: "Connect and Travel",
      description: "Chat with your carpool group, confirm details, and enjoy shared commutes."
    }
  ];

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl font-bold mb-4">How GoFAST Works</h2>
          <p className="text-lg text-muted-foreground">
            Our simple 4-step process makes carpooling with fellow students easy, 
            safe, and convenient for your daily university commute.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="relative animate-fade-in" style={{ animationDelay: `${index * 0.2}s` }}>
              {/* Step Number */}
              <div className="absolute -top-4 -left-4 h-12 w-12 rounded-full bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
                <span className="text-xl font-bold text-primary">{index + 1}</span>
              </div>
              
              {/* Content */}
              <div className="bg-card rounded-xl p-6 pt-10 h-full shadow-sm border border-border">
                <div className="mb-4">{step.icon}</div>
                <h3 className="text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-muted-foreground">{step.description}</p>
              </div>
              
              {/* Connector */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-1/2 right-0 transform translate-x-1/2 -translate-y-1/2 z-10">
                  <svg width="40" height="12" viewBox="0 0 40 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M0 6H38" stroke="currentColor" strokeWidth="2" strokeDasharray="2 2" className="text-muted-foreground" />
                    <path d="M32 1L38 6L32 11" stroke="currentColor" strokeWidth="2" className="text-muted-foreground" />
                  </svg>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <Button size="lg">
            Start Carpooling Now
          </Button>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
