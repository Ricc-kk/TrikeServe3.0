import { ArrowLeft, DollarSign, TrendingUp, Calendar, Download } from "lucide-react";
import { useNavigate } from "react-router";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import Slider from "react-slick";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

export default function Earnings() {
  const navigate = useNavigate();

  const todayEarnings = 450;
  const weekEarnings = 2850;
  const monthEarnings = 12450;

  const recentTrips = [
    {
      id: '1',
      type: 'Delivery',
      date: 'Mar 16, 2026 - 2:30 PM',
      amount: 35,
      payment: 'COD',
      status: 'Completed'
    },
    {
      id: '2',
      type: 'Ride Share',
      date: 'Mar 16, 2026 - 1:45 PM',
      amount: 15,
      payment: 'PREPAID',
      status: 'Completed'
    },
    {
      id: '3',
      type: 'Private Ride',
      date: 'Mar 16, 2026 - 12:30 PM',
      amount: 80,
      payment: 'PREPAID',
      status: 'Completed'
    },
    {
      id: '4',
      type: 'Delivery',
      date: 'Mar 16, 2026 - 11:15 AM',
      amount: 25,
      payment: 'COD',
      status: 'Completed'
    },
    {
      id: '5',
      type: 'Ride Share',
      date: 'Mar 16, 2026 - 10:00 AM',
      amount: 12,
      payment: 'PREPAID',
      status: 'Completed'
    },
  ];

  const settings = {
    dots: true,
    infinite: true,
    speed: 500,
    slidesToShow: 1,
    slidesToScroll: 1
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] pb-20">
      {/* Header */}
      <div className="bg-white border-b-2 border-[#CBD5E1] px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/rider')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-extrabold text-[#E11D48]" style={{ letterSpacing: '-0.02em' }}>
            My Earnings
          </h1>
          <p className="text-xs text-[#64748B]">Track your income</p>
        </div>
        <Button variant="ghost" size="icon">
          <Download className="w-5 h-5 text-[#64748B]" />
        </Button>
      </div>

      <div className="p-4 space-y-4">
        {/* Summary Cards Carousel */}
        <div className="earnings-carousel -mx-4 -mt-2">
          <Slider
            dots={true}
            infinite={true}
            speed={500}
            slidesToShow={1}
            slidesToScroll={1}
            arrows={false}
            swipeToSlide={true}
            touchThreshold={10}
            centerMode={false}
            variableWidth={true}
          >
            {/* Today Card */}
            <div style={{ width: '335px' }} className="pl-4 pr-1">
              <Card className="p-4 bg-gradient-to-br from-[#E11D48] to-[#BE123C] text-white border-0 rounded-2xl">
                <p className="text-sm opacity-90 mb-1">Today</p>
                <p className="text-4xl font-extrabold mb-2">₱{todayEarnings}</p>
                <div className="flex items-center gap-1 text-sm opacity-90">
                  <TrendingUp className="w-4 h-4" />
                  <span>+12% from yesterday</span>
                </div>
              </Card>
            </div>

            {/* This Week Card */}
            <div style={{ width: '335px' }} className="pl-4 pr-1">
              <Card className="p-4 bg-gradient-to-br from-teal-600 to-teal-700 text-white border-0 rounded-2xl">
                <p className="text-sm opacity-90 mb-1">This Week</p>
                <p className="text-4xl font-extrabold mb-2">₱{weekEarnings}</p>
                <div className="flex items-center gap-1 text-sm opacity-90">
                  <TrendingUp className="w-4 h-4" />
                  <span>+8% from last week</span>
                </div>
              </Card>
            </div>

            {/* This Month Card */}
            <div style={{ width: '335px' }} className="pl-4 pr-1">
              <Card className="p-4 bg-gradient-to-br from-blue-600 to-blue-700 text-white border-0 rounded-2xl">
                <p className="text-sm opacity-90 mb-1">This Month</p>
                <p className="text-4xl font-extrabold mb-2">₱{monthEarnings}</p>
                <div className="flex items-center gap-1 text-sm opacity-90">
                  <TrendingUp className="w-4 h-4" />
                  <span>+15% from last month</span>
                </div>
              </Card>
            </div>
          </Slider>
        </div>

        {/* Quick Stats */}
        <Card className="p-5 bg-white border-0 shadow-sm">
          <h3 className="font-extrabold text-[#121212] mb-4" style={{ fontSize: '18px' }}>Today's Performance</h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <div>
              <p className="text-sm text-[#0891B2] mb-1">Trips Completed</p>
              <p className="text-2xl font-extrabold text-[#E11D48]">12</p>
            </div>
            <div>
              <p className="text-sm text-[#0891B2] mb-1">Online Hours</p>
              <p className="text-2xl font-extrabold text-[#E11D48]">6.5h</p>
            </div>
            <div>
              <p className="text-sm text-[#0891B2] mb-1">Avg. per Trip</p>
              <p className="text-2xl font-extrabold text-[#E11D48]">₱37.50</p>
            </div>
            <div>
              <p className="text-sm text-[#0891B2] mb-1">Cash on Hand</p>
              <p className="text-2xl font-extrabold text-[#F97316]">₱180</p>
            </div>
          </div>
        </Card>

        {/* Recent Trips */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-extrabold text-[#121212]" style={{ fontSize: '18px' }}>Recent Trips</h3>
            <button className="text-sm font-bold text-[#E11D48]">
              View All
            </button>
          </div>
          <div className="space-y-3">
            {recentTrips.map((trip) => (
              <Card key={trip.id} className="p-4 bg-white border-0 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-extrabold text-[#121212] mb-1">{trip.type}</p>
                    <p className="text-xs text-[#0891B2]">{trip.date}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-xl text-[#E11D48] mb-1">₱{trip.amount}</p>
                    <Badge 
                      variant="outline" 
                      className={trip.payment === 'COD' ? 'border-[#F97316] text-[#F97316] rounded-full' : 'border-green-500 text-green-500 rounded-full'}
                    >
                      {trip.payment}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Badge className="bg-[#10B981] text-white border-0 rounded-md">
                    {trip.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}