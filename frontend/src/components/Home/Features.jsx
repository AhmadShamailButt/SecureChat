import React from 'react';
import { Car, Shield, Clock, Users, CreditCard, Fuel } from 'lucide-react';

const FeatureCard = ({ icon, title, description, className }) => (
  <div className={`bg-card border border-border rounded-xl p-6 transition-all duration-200 hover:shadow-md ${className}`}>
    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
      {icon}
    </div>
    <h3 className="text-lg font-semibold mb-2">{title}</h3>
    <p className="text-muted-foreground">{description}</p>
  </div>
);

const Features = () => {
  const features = [
    {
      key: 1,
      icon: <Car className="h-6 w-6 text-primary" />,
      title: "Easy Ride Sharing",
      description: "Connect with fellow students going your way for convenient, cost-effective commutes.",
      className: ""
    },
    {
      key: 2,
      icon: <Shield className="h-6 w-6 text-primary" />,
      title: "Verified Users",
      description: "All users are verified FAST NUCES students, ensuring safety and trust in the community.",
      className: ""
    },
    {
      key: 3,
      icon: <Clock className="h-6 w-6 text-primary" />,
      title: "Flexible Scheduling",
      description: "Find rides that fit your class schedule, whether it's a one-time trip or recurring ride.",
      className: ""
    },
    {
      key: 4,
      icon: <Users className="h-6 w-6 text-primary" />,
      title: "Community Building",
      description: "Meet new people, make connections, and build a stronger university community.",
      className: ""
    },
    {
      key: 5,
      icon: <CreditCard className="h-6 w-6 text-primary" />,
      title: "Cost Sharing",
      description: "Split fuel and parking costs to make transportation more affordable for everyone.",
      className: ""
    },
    {
      key: 6,
      icon: <Fuel className="h-6 w-6 text-primary" />,
      title: "Eco-Friendly",
      description: "Reduce carbon emissions and traffic congestion by sharing rides with others.",
      className: ""
    }
  ];
  
  return (
    <section className="py-16 bg-muted/30 dark:bg-muted/5">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Why Choose GoFAST Connect?</h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Our platform is designed specifically for FAST NUCES students to make commuting easier, 
            safer, and more affordable.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature) => (
            <FeatureCard
              key={feature.key}
              icon={feature.icon}
              title={feature.title}
              description={feature.description}
              className={feature.className}
            />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Features;
