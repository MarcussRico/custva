import { MerchantShell } from "../components/MerchantShell";
import { merchantApi } from "../lib/api";
import { ProfilePageClient, type MerchantProfile } from "./ProfilePageClient";

export default async function ProfilePage() {
  let profile: MerchantProfile = {
    shopName: "Your Shop",
    ownerName: "",
    email: "",
    shopLogo: null,
    shopAddress: "",
    pincode: null,
    currentRevenue: null,
    itemCategories: null,
    status: "active",
    subscriptionStatus: null
  };

  try {
    profile = await merchantApi<MerchantProfile>("/merchants/me");
  } catch {
    // keep defaults
  }

  return (
    <MerchantShell active="profile" shopName={profile.shopName}>
      <ProfilePageClient profile={profile} />
    </MerchantShell>
  );
}
