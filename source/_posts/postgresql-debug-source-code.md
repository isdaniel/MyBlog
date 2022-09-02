---
title: postgresql 
date: 2022-09-03 12:30:11
tags: [DataBase,postgresql]
categories: [postgresql]
# photos: 
#     - "https://i.imgur.com/mYYjXFg.jpg"
keywords: DataBase,postgresql
---

## 前言

因為工作需要最近在研究 postgresql DB，postgresql DB 是一個 Open Source RDBMS，所以有任何問題疑問都可以把 source code 下載並 debug 了解原因，本篇希望可以快速幫助想要透過 source code 安裝 postgresql DB 的人

### Install Postgresl

假如你跟我一樣是 Ubuntu 在安裝前需要先把開發環境設定完畢，詳細資訊可參考 [Postgresql Compile_and_Install_from_source_code](https://wiki.postgresql.org/wiki/Compile_and_Install_from_source_code)

```cmd
sudo apt-get update

sudo apt-get install build-essential libreadline-dev zlib1g-dev flex bison libxml2-dev libxslt-dev libssl-dev libxml2-utils xsltproc ccache
```

我們可以透過 [FTP Source Code](https://www.postgresql.org/ftp/source/) 要安裝 postgres source code 版本

假如我是要安裝 v12.9 的 postgres 版本，我會跑下面命令下載 source code & 解壓縮

解壓縮完畢後，應該會在該目錄看到一個該版號資料夾裡面存放的就是該版本使用 Postgresql source code.

```cmd
wget https://ftp.postgresql.org/pub/source/v12.9/postgresql-12.9.tar.gz
tar xvfz postgresql-12.9.tar.gz

cd postgresql-12.9 
```

利用 source code 安裝 postgres

* `configure`：透過參數設定 postgres 相關設定 & 安裝位置....
* `make`：透過 Makefile 安裝 postgres db

```
./configure

make & make install 
```

PostgreSQL [./configure](https://www.postgresql.org/docs/6.5/config.htm) options

* –prefix=PREFIX install  architecture-independent files in PREFIX. Default installation location is /usr/local/pgsql
* –enable-integer-datetimes  enable 64-bit integer date/time support
* –enable-nls[=LANGUAGES]  enable Native Language Support
* –disable-shared         do not build shared libraries
* –disable-rpath           do not embed shared library search path in executables
* –disable-spinlocks    do not use spinlocks
* –enable-debug           build with debugging symbols (-g)
* –enable-profiling       build with profiling enabled
* –enable-dtrace           build with DTrace support
* –enable-depend         turn on automatic dependency tracking
* –enable-cassert         enable assertion checks (for debugging)
* –enable-thread-safety  make client libraries thread-safe
* –enable-thread-safety-force  force thread-safety despite thread test failure
* –disable-largefile       omit support for large files
* –with-docdir=DIR      install the documentation in DIR [PREFIX/doc]
* –without-docdir         do not install the documentation
* –with-includes=DIRS  look for additional header files in DIRS
* –with-libraries=DIRS  look for additional libraries in DIRS
* –with-libs=DIRS         alternative spelling of –with-libraries
* –with-pgport=PORTNUM   change default port number [5432]
* –with-tcl                     build Tcl modules (PL/Tcl)
* –with-tclconfig=DIR   tclConfig.sh is in DIR
* –with-perl                   build Perl modules (PL/Perl)
* –with-python              build Python modules (PL/Python)
* –with-gssapi               build with GSSAPI support
* –with-krb5                  build with Kerberos 5 support
* –with-krb-srvnam=NAME  default service principal name in Kerberos [postgres]
* –with-pam                  build with PAM support
* –with-ldap                  build with LDAP support
* –with-bonjour            build with Bonjour support
* –with-openssl            build with OpenSSL support
* –without-readline      do not use GNU Readline nor BSD Libedit for editing
* –with-libedit-preferred  prefer BSD Libedit over GNU Readline
* –with-ossp-uuid        use OSSP UUID library when building contrib/uuid-ossp
* –with-libxml               build with XML support
* –with-libxslt               use XSLT support when building contrib/xml2
* –with-system-tzdata=DIR  use system time zone data in DIR
* –without-zlib              do not use Zlib
* –with-gnu-ld              assume the C compiler uses GNU ld [default=no]

假如在 `./configure` 沒有特別設定 `–prefix` 檔案位置預設為 `/usr/local/pgsql/`

所以我們可以透過下面命令查看安裝結果是否正確

```cmd
# ls -l /usr/local/pgsql/
total 20
drwxr-xr-x  2 root     root     4096 Sep  2 09:21 bin
drwx------ 19 postgres postgres 4096 Sep  2 09:23 data
drwxr-xr-x  6 root     root     4096 Sep  2 09:21 include
drwxr-xr-x  4 root     root     4096 Sep  2 09:21 lib
drwxr-xr-x  6 root     root     4096 Sep  2 09:21 share
```

### 建立 postgres user

建立一個 postgres user 並給密碼

```cmd
# adduser postgres

# passwd postgres
Changing password for user postgres.
New UNIX password:
Retype new UNIX password:
passwd: all authentication tokens updated successfully.
```

### 初始化 postgres data 路徑

建立一個資料夾並把權限設定給剛剛建立 postgres user

> 因為該使用者需要有權限寫入此資料夾

```cmd
mkdir /usr/local/pgsql/data
chown postgres:postgres /usr/local/pgsql/data
```

user mode 切換成 postgres user，並利用 `initdb` 初始化資料庫

```
# su - postgres
# /usr/local/pgsql/bin/initdb -D /usr/local/pgsql/data/
```

查看 `/usr/local/pgsql/data` 資料夾應該會有如下檔案

```cmd
ls -l /usr/local/pgsql/data
-rw------- 1 postgres postgres     3 Aug 31 06:02 PG_VERSION
drwx------ 6 postgres postgres  4096 Aug 31 06:03 base
drwx------ 2 postgres postgres  4096 Sep  2 07:47 global
drwx------ 2 postgres postgres  4096 Aug 31 06:02 pg_commit_ts
drwx------ 2 postgres postgres  4096 Aug 31 06:02 pg_dynshmem
-rw------- 1 postgres postgres  4760 Aug 31 06:02 pg_hba.conf
-rw------- 1 postgres postgres  1636 Aug 31 06:02 pg_ident.conf
drwx------ 4 postgres postgres  4096 Sep  1 09:23 pg_logical
drwx------ 4 postgres postgres  4096 Aug 31 06:02 pg_multixact
drwx------ 2 postgres postgres  4096 Sep  2 07:46 pg_notify
drwx------ 2 postgres postgres  4096 Aug 31 06:02 pg_replslot
drwx------ 2 postgres postgres  4096 Aug 31 06:02 pg_serial
drwx------ 2 postgres postgres  4096 Aug 31 06:02 pg_snapshots
drwx------ 2 postgres postgres  4096 Sep  2 07:46 pg_stat
drwx------ 2 postgres postgres  4096 Sep  2 07:50 pg_stat_tmp
drwx------ 2 postgres postgres  4096 Aug 31 06:02 pg_subtrans
drwx------ 2 postgres postgres  4096 Aug 31 06:02 pg_tblspc
drwx------ 2 postgres postgres  4096 Aug 31 06:02 pg_twophase
drwx------ 3 postgres postgres  4096 Aug 31 08:05 pg_wal
drwx------ 2 postgres postgres  4096 Aug 31 06:02 pg_xact
-rw------- 1 postgres postgres    88 Aug 31 06:02 postgresql.auto.conf
-rw------- 1 postgres postgres 26720 Aug 31 06:02 postgresql.conf
-rw------- 1 postgres postgres    59 Sep  2 07:46 postmaster.opts
-rw------- 1 postgres postgres    87 Sep  2 07:46 postmaster.pid
```

### 啟動 postgres db

最後利用 postgres user 執行 `postmaster` 啟動 postgres db

```cmd
$ /usr/local/pgsql/bin/postmaster -D /usr/local/pgsql/data >logfile 2>&1 &
[1] 7936
```

啟動完畢後可以利用 `psql` 進入 postgres 操作 db

```cmd
#/usr/local/pgsql/bin/psql

psql (12.12)
Type "help" for help.

postgres=# 
```

## 小結

希望透過這邊文章可以幫助大家，利用 postgres source code 安裝 db 環境，並進行 debug & 調式，詳細文章可以參考官網 [Installation from Source Code](https://www.postgresql.org/docs/current/installation.html)

