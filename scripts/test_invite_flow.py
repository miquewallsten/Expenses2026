import requests
import json

def test_tenant_creation_invite():
    base_url = "http://localhost:8000"
    
    # Payload for a new tenant
    tenant_data = {
        "name": "Acme Ventures",
        "slug": "acme-ventures",
        "admin_email": "mikaelwallsten@me.com" # Using your real email for the test invite
    }

    print(f"🚀 Creating tenant: {tenant_data['name']}...")
    
    try:
        # Note: In a real scenario we'd need a super-admin token, 
        # but for this logic check we're looking at the execution of notifier.send
        response = requests.post(f"{base_url}/super-admin/tenants", json=tenant_data)
        
        if response.status_code == 200:
            result = response.json()
            print("✅ Tenant created successfully!")
            print(f"   ID: {result['id']}")
            print(f"   Invite Link (copy): {result.get('invite_link')}")
        else:
            print(f"❌ Failed: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_tenant_creation_invite()
