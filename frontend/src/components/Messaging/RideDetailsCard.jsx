import React from 'react';
import { Calendar, Clock, MapPin, Users } from 'lucide-react';
import Button from '../ui/compatibility-button';

export default function RideDetailsCard() {
  const rideDetails = {
    date: 'Tomorrow, May 15, 2023',
    time: '8:15 AM',
    pickup: 'Morning Brew Cafe, North Nazimabad',
    dropoff: 'FAST NUCES Main Campus',
    seats: 1
  };

  return (
    <div className="mb-4 p-4 rounded-lg bg-card border border-border max-w-md mx-auto">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-medium">Ride Details</h4>
        <Button variant="outline" size="sm">View Ride</Button>
      </div>
      <div className="space-y-2 text-sm">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>{rideDetails.date}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span>{rideDetails.time}</span>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div>
            <div>From: {rideDetails.pickup}</div>
            <div className="mt-1">To: {rideDetails.dropoff}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{rideDetails.seats} seat reserved</span>
        </div>
      </div>
    </div>
  );
}