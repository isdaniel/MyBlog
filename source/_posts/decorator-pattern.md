---
title: (C#)裝飾者模式(Decorator Pattern)
date: 2019-06-01 20:37:16
tags: [C#,Design-Pattern,Decorator-Pattern]
categories: [C#,DesignPattern]
---
裝飾者模式是一個很精美且優雅的模式

本篇範例 文字內容->AES加密->Zip檔附加密碼->輸出儲存

**情境**
有個需求要做

* 文字內容->壓縮zip(附上密碼)->輸出儲存
*又改成...*

* 文字內容->AES加密->輸出儲存
*需求又改成....*

* 文字內容->AES加密->Zip檔附加密碼->輸出儲存

可發現需求一直在對於**文字內容**操作順序做變化,但他們核心離不開對於**文字內容**的操作

這種情境很適合來使用 **[裝飾者模式]**

裝飾者模式 有兩個主要角色 **被裝飾物件(Decorated) & 裝飾物件(Decorator)**

1. 被裝飾物件(Decorated)就像蛋糕的一樣, 
2. 裝飾物件(Decorator)就是上的水果,奶油,巧克力...等等裝飾物品

一般先有蛋糕**被裝飾物件(Decorated)**,後再將裝飾物品加上去**裝飾物件(Decorator)**

被裝飾物件(Decorated)如下圖  蛋糕的原型

![](https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/4bc56f03-a1e1-4504-bea3-7cb02a8aaa21/1522894727_00158.jpg)

[圖片來源](http://www.chuyixuexi.com/caipu/2016/02/01/288202.html)

* 將物件有效的往上附加職責,不動到內部的程式碼, 在原來職責上附加額外的職責
* 裝飾者模式運作就像 俄羅斯娃娃一樣 一層包一層

![https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/4bc56f03-a1e1-4504-bea3-7cb02a8aaa21/1522826815_28596.jpg](https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/4bc56f03-a1e1-4504-bea3-7cb02a8aaa21/1522826815_28596.jpg)

[圖片來源](http://www.52toys.com/post/1009306.html)



-----


第一步 先找尋他們共同裝飾東西,因為是讀寫檔案 所以我們可以對於**Byte**下手


先做出 **讀** 跟 **寫** 介面簽章當作裝飾動作的統一介面

```c#
public interface IProcess
{
    byte[] Read(string path);

    void Write(string writePath, byte[] buffer);
}
```
 

在創建一個 ProcessBase 給日後裝飾物品(Decorator)來繼承

```c#
public abstract class ProcessBase : IProcess
{
    /// <summary>
    /// 儲存被裝飾的物件
    /// </summary>
    protected IProcess _process;

    public abstract byte[] Read(string path);

    public abstract void Write(string writePath, byte[] buffer);

    public virtual void SetDecorated(IProcess process)
    {
        _process = process;
    }
}
```
 

有兩點特別說明

1. `protected IProcess _process;`  儲存被裝飾的物件由 `SetDecorated` 方法來設置被裝飾的物件
2. 就像俄羅斯娃娃只包裹一個娃娃,不管被包裹娃娃之前包含哪些娃娃

-----

第二步 創建被裝飾物品(Decorated) 

因為是檔案我們直接使用 

* File.ReadAllBytes 讀 檔案
* File.WriteAllBytes 寫 檔案

```c#
/// <summary>
/// 讀取檔案
/// </summary>
public class FileProcess : IProcess
{
    public byte[] Read(string path)
    {
        return File.ReadAllBytes(path);
    }

    public void Write(string writePath, byte[] buffer)
    {
        File.WriteAllBytes(writePath, buffer);
    }
}
```
 
第三步 創建裝飾物品(Decorator)

這次主要裝飾物品有兩個 

1. 加壓解壓ZIP檔
2. 加解密
 
加密裝飾器繼承`ProcessBase`並按照加解密重寫 `Write`和 `read` 方法

```c#
/// <summary>
/// Aes 加密裝飾器
/// </summary>
public class AESCrypProcess : ProcessBase
{
    private AesCryptoServiceProvider aes;

    public string AESKey { get; set; } = "1776D8E110124E75";
    public string AESIV { get; set; } = "B890E7F6BA01C273";

    public AESCrypProcess() 
    {
        aes = new AesCryptoServiceProvider();
        aes.Key = Encoding.UTF8.GetBytes(AESKey);
        aes.IV = Encoding.UTF8.GetBytes(AESIV);
    }

    public override byte[] Read(string path)
    {
        byte[] encryptBytes = _process.Read(path);
        return DecryptData(encryptBytes);
    }

    /// <summary>
    /// 進行解密
    /// </summary>
    /// <param name="encryptBytes"></param>
    /// <returns></returns>
    private byte[] DecryptData(byte[] encryptBytes)
    {
        byte[] outputBytes = null;
        using (MemoryStream memoryStream = new MemoryStream(encryptBytes))
        {
            using (CryptoStream decryptStream = new CryptoStream(memoryStream, aes.CreateDecryptor(), CryptoStreamMode.Read))
            {
                MemoryStream outputStream = new MemoryStream();
                decryptStream.CopyTo(outputStream);
                outputBytes = outputStream.ToArray();
            }
        }
        return outputBytes;
    }

    /// <summary>
    /// 裝飾者呼叫方法
    /// </summary>
    /// <param name="path"></param>
    /// <param name="data"></param>
    public override void Write(string path, byte[] data)
    {
        byte[] outputBytes = EncryptData(data);
        _process.Write(path, outputBytes);
    }

    private byte[] EncryptData(byte[] data)
    {
        byte[] outputBytes = null;
        using (MemoryStream memoryStream = new MemoryStream())
        {
            using (CryptoStream encryptStream = new CryptoStream(memoryStream, aes.CreateEncryptor(), CryptoStreamMode.Write))
            {
                MemoryStream inputStream = new MemoryStream(data);
                inputStream.CopyTo(encryptStream);
                encryptStream.FlushFinalBlock();
                outputBytes = memoryStream.ToArray();
            }
        }

        return outputBytes;
    }
}
 
```

這次讀寫zip使用 [SharpZipLib](https://github.com/icsharpcode/SharpZipLib) 開源第三方插件

ZIP裝飾器繼承`ProcessBase`並按照加解密重寫 `Write`和 `read` 方法

```c#

/// <summary>
/// 讀取Zip使用
/// </summary>
public class ZipProcess : ProcessBase
{
    public string PassWord { get; set; }
    public string FileName { get; set; }

    public override byte[] Read(string path)
    {
        byte[] buffer = _process.Read(path);
        return ZipReader(path, buffer);
    }

    public override void Write(string writePath, byte[] data)
    {
        byte[] buffer = ZipWriter(data);
        _process.Write(writePath, buffer);
    }

    private byte[] ZipWriter(byte[] buffer)
    {
        using (MemoryStream outputMemStream = new MemoryStream())
        using (ZipOutputStream zipStream = new ZipOutputStream(outputMemStream))
        using (MemoryStream memStreamIn = new MemoryStream(buffer))
        {
            zipStream.SetLevel(9); 

            ZipEntry newEntry = new ZipEntry(FileName);
            newEntry.DateTime = DateTime.Now;
            zipStream.Password = PassWord;
            zipStream.PutNextEntry(newEntry);

            StreamUtils.Copy(memStreamIn, zipStream, new byte[4096]);//將zip流搬到memoryStream中
            zipStream.CloseEntry();

            zipStream.IsStreamOwner = false;   
            zipStream.Close();                

            return outputMemStream.ToArray();
        }
    }

    /// <summary>
    /// 讀取zip檔
    /// </summary>
    /// <param name="buffer">zip檔案byte</param>
    /// <returns></returns>
    private byte[] ZipReader(string filePath, byte[] buffer)
    {
        byte[] zipBuffer = default(byte[]);
        using (MemoryStream memoryStream = new MemoryStream(buffer))
        {
            memoryStream.Seek(0, SeekOrigin.Begin);
            var zip = new ZipFile(memoryStream);
            zip.Password = PassWord;
            using (MemoryStream streamWriter = new MemoryStream())
            {
                byte[] bufferReader = new byte[4096];
                var file = zip.GetEntry(FileName); //設置要去得的檔名
                //如果有檔案
                if (file != null)
                {
                    var zipStream = zip.GetInputStream(file);
                    StreamUtils.Copy(zipStream, streamWriter, bufferReader);
                    zipBuffer = streamWriter.ToArray();
                }
            }
        }
        return zipBuffer;
    }
}
```

上面就把我們要用的裝飾物品 (備料) 準備完成



-----



第四步 創建使用(開始擺盤)
 

創建一個 `DecorateFactory` 來當生產 裝飾產品的工廠

建構子傳入一個 被裝飾的物件(`FileProcess`) 之後可依照喜好一直疊加 裝飾物品(`ZipProcess`,`AESCrypProcess`...)


```c#
public class DecorateFactory
{
    IProcess _original;

    public DecorateFactory(IProcess original)
    {
        _original = original;
    }

    public DecorateFactory SetProcess(ProcessBase process)
    {
        process.SetDecorated(_original);
        _original = process;
        return this;
    }

    public IProcess GetProcess()
    {
        return _original;
    }
}
```

> **裝飾者模式 裝飾的順序是很重要的**

為了方便讀者閱讀 我使用小畫家畫出 讀寫順序

如下圖

![](https://dotblogsfile.blob.core.windows.net/user/%E4%B9%9D%E6%A1%83/4bc56f03-a1e1-4504-bea3-7cb02a8aaa21/1522828936_73575.png)


使用就可很清晰來用

`DecorateFactory`來創建裝飾流程
`factroy.GetProcess();` 方法取得完成後的產品

在簡單呼叫**讀**和**寫**方法

```C#
string filePath = @"C:\Users\daniel.shih\Desktop\test.zip";
string content = $"你好 123456 12@()!@ {Environment.NewLine} fsfd嘻嘻哈哈!!";

//設置初始化的被裝飾者
DecorateFactory factroy = new DecorateFactory(new FileProcess());

//設置裝飾的順序
factroy.SetProcess(new AESCrypProcess())
        .SetProcess(new ZipProcess() { FileName = "1.txt",PassWord ="1234567"});

IProcess process = factroy.GetProcess();

byte[] data_buffer = Encoding.UTF8.GetBytes(content);
process.Write(filePath, data_buffer);

byte[] buffer = process.Read(filePath);
Console.WriteLine(Encoding.UTF8.GetString(buffer));
```

日後不管需求是改成

* 文字內容->壓縮zip(附上密碼)->輸出儲存
* 文字內容->AES加密->輸出儲存
* 文字內容->AES加密->Zip檔附加密碼->輸出儲存

還是.....

我們都不怕因為我們把各種操作`封裝`和`多態`

各個模組間都是獨立的很好映證 `高內聚低耦合` 的設計原則

**小結:**

裝飾者模式是一個很精美且優雅的模式 希望這篇文章可讓讀者對於此模式有更加了解

[GitHub範例連結](https://github.com/isdaniel/DesignPattern/tree/master/DesignPattern/DecoratePattern)