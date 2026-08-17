import { createBrowserRouter, redirect } from "react-router";
import Root from "./components/Root";
import Login from "./components/Login";
import SignUp from "./components/auth/SignUp";
import ForgotPassword from "./components/auth/ForgotPassword";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRedirect from "./components/RoleRedirect";
import RiderDashboard from "./components/rider/RiderDashboard";
import ServiceTypes from "./components/rider/ServiceTypes";
import MyDestination from "./components/rider/MyDestination";
import AutoAccept from "./components/rider/AutoAccept";
import MoreOptions from "./components/rider/MoreOptions";
import PassengerRequests from "./components/rider/PassengerRequests";
import ActiveRide from "./components/rider/ActiveRide";
import Earnings from "./components/rider/Earnings";
import RiderProfile from "./components/rider/RiderProfile";
import RiderMessagesPage from "./components/rider/RiderMessagesPage";
import RiderDirectChat from "./components/rider/RiderDirectChat";
import BusinessDashboard from "./components/business/BusinessDashboard";
import BusinessHome from "./components/business/BusinessHome";
import BusinessMenu from "./components/business/BusinessMenu";
import BusinessOrders from "./components/business/BusinessOrders";
import BusinessAccount from "./components/business/BusinessAccount";
import BusinessMessages from "./components/business/BusinessMessages";
import CustomerApp from "./components/customer/CustomerApp";
import CustomerHome from "./components/customer/Home";
import FoodHome from "./components/customer/FoodHome";
import CategoryFood from "./components/customer/CategoryFood";
import RestaurantDetail from "./components/customer/RestaurantDetail";
import Cart from "./components/customer/Cart";
import Activity from "./components/customer/Activity";
import CustomerMessages from "./components/customer/CustomerMessages";
import Notifications from "./components/customer/Notifications";
import Account from "./components/customer/Account";
import AccountManagement from "./components/customer/AccountManagement";
import Profile from "./components/customer/Profile";
import OrderDetail from "./components/customer/OrderDetail";
import Favorites from "./components/customer/Favorites";
import AdminDashboard from "./components/admin/AdminDashboard";
import AdminUsers from "./components/admin/AdminUsers";
import AdminTerminals from "./components/admin/AdminTerminals";
import AdminSettings from "./components/admin/AdminSettings";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: Login },
      { path: "signup", Component: SignUp },
      { path: "forgot-password", Component: ForgotPassword },
      { 
        path: "redirect", 
        element: <RoleRedirect /> 
      },
      // Rider routes - protected
      { 
        path: "rider", 
        element: (
          <ProtectedRoute allowedRoles={['rider']}>
            <RiderDashboard />
          </ProtectedRoute>
        )
      },
      { 
        path: "rider/service-types", 
        element: (
          <ProtectedRoute allowedRoles={['rider']}>
            <ServiceTypes />
          </ProtectedRoute>
        )
      },
      { 
        path: "rider/my-destination", 
        element: (
          <ProtectedRoute allowedRoles={['rider']}>
            <MyDestination />
          </ProtectedRoute>
        )
      },
      { 
        path: "rider/auto-accept",
        element: (
          <ProtectedRoute allowedRoles={['rider']}>
            <AutoAccept />
          </ProtectedRoute>
        )
      },
      {
        path: "rider/more-options",
        element: (
          <ProtectedRoute allowedRoles={['rider']}>
            <MoreOptions />
          </ProtectedRoute>
        )
      },
      { 
        path: "rider/passenger-requests", 
        element: (
          <ProtectedRoute allowedRoles={['rider']}>
            <PassengerRequests />
          </ProtectedRoute>
        )
      },
      { 
        path: "rider/active-ride", 
        element: (
          <ProtectedRoute allowedRoles={['rider']}>
            <ActiveRide />
          </ProtectedRoute>
        )
      },
      { 
        path: "rider/earnings", 
        element: (
          <ProtectedRoute allowedRoles={['rider']}>
            <Earnings />
          </ProtectedRoute>
        )
      },
      {
        path: "rider/profile",
        element: (
          <ProtectedRoute allowedRoles={['rider']}>
            <RiderProfile />
          </ProtectedRoute>
        )
      },
      { 
        path: "rider/messages", 
        element: (
          <ProtectedRoute allowedRoles={['rider']}>
            <RiderMessagesPage />
          </ProtectedRoute>
        )
      },
      {
        path: "rider/messages/thread/:conversationId",
        element: (
          <ProtectedRoute allowedRoles={['rider']}>
            <RiderMessagesPage />
          </ProtectedRoute>
        )
      },
      { 
        path: "rider/messages/:rideId/:passengerId", 
        element: (
          <ProtectedRoute allowedRoles={['rider']}>
            <RiderDirectChat />
          </ProtectedRoute>
        )
      },
      // Business routes - protected
      { 
        path: "business", 
        element: (
          <ProtectedRoute allowedRoles={['business']}>
            <BusinessDashboard />
          </ProtectedRoute>
        )
      },
      { 
        path: "business/dashboard", 
        element: (
          <ProtectedRoute allowedRoles={['business']}>
            <BusinessDashboard />
          </ProtectedRoute>
        )
      },
      { 
        path: "business/home", 
        element: (
          <ProtectedRoute allowedRoles={['business']}>
            <BusinessHome />
          </ProtectedRoute>
        )
      },
      { 
        path: "business/menu", 
        element: (
          <ProtectedRoute allowedRoles={['business']}>
            <BusinessMenu />
          </ProtectedRoute>
        )
      },
      { 
        path: "business/orders", 
        element: (
          <ProtectedRoute allowedRoles={['business']}>
            <BusinessOrders />
          </ProtectedRoute>
        )
      },
      { 
        path: "business/account", 
        element: (
          <ProtectedRoute allowedRoles={['business']}>
            <BusinessAccount />
          </ProtectedRoute>
        )
      },
      // Redirect old business routes to dashboard using loader
      { path: "business/customers", loader: () => redirect("/business/dashboard") },
      {
        path: "business/messages",
        element: (
          <ProtectedRoute allowedRoles={['business']}>
            <BusinessMessages />
          </ProtectedRoute>
        )
      },
      {
        path: "business/messages/thread/:conversationId",
        element: (
          <ProtectedRoute allowedRoles={['business']}>
            <BusinessMessages />
          </ProtectedRoute>
        )
      },
      { path: "business/analytics", loader: () => redirect("/business/dashboard") },
      // Customer routes - protected
      { 
        path: "customer", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <CustomerHome />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/old", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <CustomerApp />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/food", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <FoodHome />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/category-food", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <CategoryFood />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/restaurant-detail", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <RestaurantDetail />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/cart", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <Cart />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/activity", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <Activity />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/messages", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <CustomerMessages />
          </ProtectedRoute>
        )
      },
      {
        path: "customer/messages/thread/:conversationId",
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <CustomerMessages />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/notifications", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <Notifications />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/account", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <Account />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/account-management", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <AccountManagement />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/profile", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <Profile />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/order-detail/:orderId", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <OrderDetail />
          </ProtectedRoute>
        )
      },
      { 
        path: "customer/favorites", 
        element: (
          <ProtectedRoute allowedRoles={['customer']}>
            <Favorites />
          </ProtectedRoute>
        )
      },
      // Admin routes - protected
      {
        path: "admin",
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        )
      },
      {
        path: "admin/dashboard",
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminDashboard />
          </ProtectedRoute>
        )
      },
      {
        path: "admin/users",
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminUsers />
          </ProtectedRoute>
        )
      },
      {
        path: "admin/terminals",
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminTerminals />
          </ProtectedRoute>
        )
      },
      {
        path: "admin/settings",
        element: (
          <ProtectedRoute allowedRoles={['admin']}>
            <AdminSettings />
          </ProtectedRoute>
        )
      },
    ],
  },
]);