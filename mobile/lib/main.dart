import 'package:flutter/material.dart';
import 'services/api_client.dart';

void main() {
  runApp(const AutoFixApp());
}

class AutoFixApp extends StatelessWidget {
  const AutoFixApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '车匠云修',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xff176e9c)),
        useMaterial3: true,
      ),
      home: const LoginPage(),
    );
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _username = TextEditingController(text: 'admin');
  final _password = TextEditingController(text: 'Admin@123');
  final _api = ApiClient();
  bool _loading = false;
  String? _error;

  Future<void> _login() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await _api.login(_username.text.trim(), _password.text);
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => HomePage(api: _api)),
      );
    } catch (error) {
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xff10263f),
      body: Center(
        child: Card(
          margin: const EdgeInsets.all(24),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.build_circle, size: 44, color: Color(0xff176e9c)),
                  const SizedBox(height: 12),
                  Text('车匠云修', style: Theme.of(context).textTheme.headlineSmall),
                  const Text('AutoFix Workshop'),
                  const SizedBox(height: 28),
                  TextField(controller: _username, decoration: const InputDecoration(labelText: '用户名')),
                  const SizedBox(height: 12),
                  TextField(controller: _password, obscureText: true, decoration: const InputDecoration(labelText: '密码')),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!, style: const TextStyle(color: Colors.red)),
                  ],
                  const SizedBox(height: 20),
                  FilledButton(
                    onPressed: _loading ? null : _login,
                    child: Text(_loading ? '登录中...' : '登录'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({required this.api, super.key});
  final ApiClient api;

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  List<dynamic> _orders = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final orders = await widget.api.get('/work-orders') as List<dynamic>;
    if (mounted) setState(() => _orders = orders);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('车匠云修')),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Text('我的工单', style: Theme.of(context).textTheme.headlineSmall),
            const SizedBox(height: 14),
            if (_orders.isEmpty)
              const Card(child: Padding(padding: EdgeInsets.all(20), child: Text('暂无工单')))
            else
              ..._orders.map((order) => Card(
                    child: ListTile(
                      leading: const Icon(Icons.car_repair),
                      title: Text(order['orderNo']?.toString() ?? ''),
                      subtitle: Text(order['customerRequest']?.toString() ?? ''),
                      trailing: Text(order['status']?.toString() ?? ''),
                    ),
                  )),
          ],
        ),
      ),
    );
  }
}

