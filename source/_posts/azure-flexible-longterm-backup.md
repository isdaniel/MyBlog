---
title: Azure PostgreSQL Flexible long term backup with Managed Identity 
date: 2022-12-25 22:30:11
tags: [Azure]
categories: [Azure,flexibleServer,Managed Identity ]
keywords: Azure,flexibleServer,Managed Identity 
---

## Introduction 

This ariticle will guide us how to do long-term backup (more than 35 days) on Azure PostgreSQL Flexible.

## Prerequisites:

* A Postgres flexible server and an Azure VM (Linux (ubuntu 20.04)) that has access to it.
* A MI (Managed Identity) in your subscription.
* Please kindly make sure backup Postgres flexible server version align with pg_dump version.

Here is the sample code of Azure PostgreSQL Flexible long term backup with Managed Identity.

```bash
echo 'start program'
echo '====================='
echo 'start installing postgresql client suit'
sudo apt update
sudo apt -y install postgresql-client
echo '======================'
echo 'postgresql client install ends'
echo 'start mount storage'

wget https://packages.microsoft.com/config/ubuntu/20.04/packages-microsoft-prod.deb
sudo dpkg -i packages-microsoft-prod.deb
sudo apt-get update
sudo apt-get install blobfuse -y
sudo apt-get install jq -y

if [ ! -f blob.conf  ]; then
    echo 'accountName <<Your blob accountName>>' >> blob.conf 
	echo 'authType MSI' >> fuse_connection.cfg
	echo 'identityObjectId <<Your blob accountKey>>' >> blob.conf 
	echo 'containerName <<Your blob Container Name>>' >> blob.conf 
fi
#create a folder which can mount to blob
mkdir ~/data
sudo blobfuse ~/data --tmp-path=/mnt/resource/mycontainer  --config-file=./blob.conf -o attr_timeout=240 -o entry_timeout=240 -o negative_timeout=120

echo '======= starting backup============'
DNAME=`date +%Y%m%d%H%M%S`
export PGPASSWORD=`curl -s 'http://169.254.169.254/metadata/identity/oauth2/token?api-version=2018-02-01&resource=https%3A%2F%2Fossrdbms-aad.database.windows.net&client_id=<<MI client ID>>' -H Metadata:true | jq -r .access_token`
pg_dump --host=test-conn.postgres.database.azure.com --username='MI-Demo' -Fc -c  testdb > ~/data/dump$DNAME.sql
```

## Experiments:

### Here is the guideline for using managed identity to connect to your DB server in VM.
 
We would make sure the Authentication setting that was PostgreSQL and Azure Active Directory authentication.

![](https://i.imgur.com/BVNlWCx.png)

Selected which managed identity you want to add to the PostgreSQL flexible server.
 
![](https://i.imgur.com/61LOp1w.png)

When we had added managed identity in Azure portal that will add the managed identity in the PostgreSQL server.
 
In below script, we need to replace `<<MI client ID>>` by your MI Client Id and replace by your login MI as red frames that would tell Azure PostgreSQL server verify MI user by access token instead of user password.

![](https://i.imgur.com/r8IBDz8.png)

 
After we replace all content by your really connect information that I pointed out, we can try to run the script and the backup file would be back up by pg_dump without password.

![](https://i.imgur.com/qhOIDsV.png)

### Here is guideline to guide us how to mount Linux VM from blob storage by MI.
 
If you’re using User assigned managed identity, please add the identity in `User assigned` configuration of your Linux VM as shown below (choose which MI you want to use to verify.)

![](https://i.imgur.com/BgKLeeS.png)

Please following the step “Managed Identities -> Azure role assignments -> Add role assignment (Preview)” to choose which Blob storage you want to mounted and verified by the MI.

![](https://i.imgur.com/1Tpvopj.png)

Edit the storage account information which mark as red frame from the script which I provided to you.

* AccountName: blob Account Name
* AuthType: auth type must be MSI
* IdentityObjectId: Filled with your managed identity object it as below red arrow.
* ContainerName: blob Container Name
![](https://i.imgur.com/cJLGI1i.png)

After the execution, you could see the dump file has successfully uploaded to storage account.

![](https://i.imgur.com/ROSZvsp.png)

## More information
 
https://techcommunity.microsoft.com/t5/azure-paas-blog/mount-blob-storage-on-linux-vm-using-managed-identities-or/ba-p/1821744
 
https://github.com/Azure/azure-storage-fuse/blob/master/README.md#valid-authentication-setups
