import { configureStore } from "@reduxjs/toolkit";
import userReducer from "./userSlice";
import upcomingRidesReducer from "./upcomingRidesSlice";
import pendingRequestsReducer from "./pendingRequestSlice";
import carpoolHistoryReducer from "./carpoolHistorySlice"; 
import chatReducer from "./chatSlice";

const store = configureStore({
  reducer: {
    user: userReducer,
    upcomingRides: upcomingRidesReducer,
    pendingRequests: pendingRequestsReducer,
    carpoolHistory: carpoolHistoryReducer,
    chat: chatReducer,
  },
});

export default store;
